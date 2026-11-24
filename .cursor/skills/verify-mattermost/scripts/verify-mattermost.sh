#!/usr/bin/env bash
# Launch, check, drive and tear down a local Mattermost (server :8065 + webpack-watched webapp)
# for scripted verification. See ../SKILL.md for the full contract.
#
#   verify-mattermost.sh launch                  start postgres+redis, server, webapp; wait until usable; seed
#   verify-mattermost.sh doctor                  read-only: is the running instance ours and worth driving?
#   verify-mattermost.sh drive <journey> [args]  run journeys/<journey>.spec.ts with Playwright
#   verify-mattermost.sh cleanup [--keep-data]   stop what launch started; evidence is never removed
set -Eeuo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(git -C "$SKILL_DIR" rev-parse --show-toplevel)"
STATE_DIR="${VERIFY_MM_STATE_DIR:-/tmp/verify-mattermost}"
LOCAL_EVIDENCE_ROOT="$HOME/verify-mattermost-evidence"
EVIDENCE_ROOT="${VERIFY_MM_EVIDENCE_DIR:-$LOCAL_EVIDENCE_ROOT}"
BASE_URL="http://localhost:8065"
SERVER_SESSION="verify-mm-server"
WEBAPP_SESSION="verify-mm-webapp"
CONTAINERS=(mattermost-postgres mattermost-redis)
PG_VOLUME_LABEL="com.docker.compose.volume=postgres-15-data"
KEPT_DATA_MARKER="${STATE_DIR}.kept-data"
SERVER_READY_TIMEOUT="${VERIFY_MM_SERVER_TIMEOUT:-1200}"
WEBAPP_READY_TIMEOUT="${VERIFY_MM_WEBAPP_TIMEOUT:-900}"

log() { printf '[verify-mattermost] %s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

tmux_cmd() {
    if [ -f /exec-daemon/tmux.portal.conf ]; then
        tmux -f /exec-daemon/tmux.portal.conf "$@"
    else
        tmux "$@"
    fi
}

session_alive() { tmux_cmd has-session -t "=$1" 2>/dev/null; }

use_toolchain() {
    export GOPATH="${GOPATH:-$HOME/go}"
    export PATH="/usr/local/go/bin:$GOPATH/bin:$PATH"
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    if [ -s "$NVM_DIR/nvm.sh" ]; then
        # shellcheck source=/dev/null
        . "$NVM_DIR/nvm.sh"
        nvm use "$(tr -d '[:space:]' < "$REPO/.nvmrc")" >/dev/null
    fi
    local want_node
    want_node="$(tr -d '[:space:]' < "$REPO/.nvmrc")"
    [ -x "$NVM_DIR/versions/node/v$want_node/bin/node" ] && export PATH="$NVM_DIR/versions/node/v$want_node/bin:$PATH"
    hash -r
    case "$(node --version 2>/dev/null)" in
        "v$want_node"*) ;;
        *) die "node $(node --version 2>/dev/null || echo missing) does not match .nvmrc ($want_node); run .cursor/scripts/cloud-agent-install.sh" ;;
    esac
}

pg_volumes() { docker volume ls -q --filter "label=$PG_VOLUME_LABEL" | tr '\n' ' '; }

port_owner() { ss -Hltnp "sport = :$1" 2>/dev/null | head -1; }

ping_ok() {
    local body
    body="$(curl -fsS --max-time 5 "$BASE_URL/api/v4/system/ping?get_server_status=true" 2>/dev/null)" || return 1
    grep -q '"status":"OK"' <<< "$body"
}

webapp_served() {
    local body
    body="$(curl -fsS --max-time 5 "$BASE_URL/" 2>/dev/null)" || return 1
    grep -Eq "id=[\"']root[\"']" <<< "$body"
}

webapp_compiled() { grep -Eq 'compiled (successfully|with [0-9]+ warning)' "$STATE_DIR/webapp.log" 2>/dev/null; }

wait_for() {
    local what="$1" timeout="$2" check="$3" session="$4" waited=0
    log "waiting for $what (timeout ${timeout}s)"
    until $check; do
        session_alive "$session" || die "$what: tmux session $session exited; see $STATE_DIR/${session#verify-mm-}.log"
        [ "$waited" -ge "$timeout" ] && die "$what not ready after ${timeout}s; see $STATE_DIR/${session#verify-mm-}.log"
        sleep 5
        waited=$((waited + 5))
    done
    log "$what ready after ${waited}s"
}

start_session() {
    local name="$1" dir="$2" cmd="$3" logfile="$4"
    tmux_cmd new-session -d -s "$name" -c "$dir" \
        "bash -lc '$cmd 2>&1 | tee $logfile; echo \"[verify-mattermost] exited: \${PIPESTATUS[0]}\" >> $logfile'"
    tmux_cmd display-message -p -t "=$name:0.0" '#{pane_pid}' > "$STATE_DIR/$name.pid"
}

# Cloud VMs with restricted egress reach registry-1.docker.io but not its blob store, so pulls of
# postgres/redis fail with "error pulling image configuration ... EOF". Fall back to the same
# official images on ECR Public, and build a local stand-in for the Docker-Hub-only wait-for-dep.
ensure_images() {
    local image
    for image in postgres:15 redis:7.4.0; do
        docker image inspect "$image" >/dev/null 2>&1 && continue
        if ! timeout 300 docker pull -q "$image" >/dev/null 2>&1; then
            log "docker hub pull of $image failed; using public.ecr.aws/docker/library/$image"
            docker pull -q "public.ecr.aws/docker/library/$image" >/dev/null
            docker tag "public.ecr.aws/docker/library/$image" "$image"
        fi
    done
    image="mattermost/mattermost-wait-for-dep:latest"
    if ! docker image inspect "$image" >/dev/null 2>&1 && ! timeout 120 docker pull -q "$image" >/dev/null 2>&1; then
        log "docker hub pull of $image failed; building stand-in from scripts/wait-for-dep"
        docker build -q -t "$image" "$SKILL_DIR/scripts/wait-for-dep" >/dev/null
    fi
}

cmd_launch() {
    use_toolchain
    docker info >/dev/null 2>&1 || die "docker is not reachable; run .cursor/scripts/cloud-agent-start.sh"
    ensure_images
    if [ -f "$STATE_DIR/launched" ]; then
        die "a verification instance is already recorded in $STATE_DIR; run doctor, or cleanup first"
    fi
    for port in 8065 5432 6379; do
        [ -z "$(port_owner "$port")" ] || die "port $port is already in use by another process; not ours to drive: $(port_owner "$port")"
    done
    for c in "${CONTAINERS[@]}"; do
        if docker container inspect "$c" >/dev/null 2>&1; then
            die "container $c already exists and was not started by this run; remove it or reuse its owner's instance"
        fi
    done
    if [ -n "$(pg_volumes)" ] && [ "$(cat "$KEPT_DATA_MARKER" 2>/dev/null)" != "$(pg_volumes)" ]; then
        die "postgres volume $(pg_volumes) already exists, so this would not start from an empty database; remove it if it is disposable"
    fi
    session_alive "$SERVER_SESSION" && die "tmux session $SERVER_SESSION already exists"
    session_alive "$WEBAPP_SESSION" && die "tmux session $WEBAPP_SESSION already exists"

    mkdir -p "$STATE_DIR"
    date -u +%Y-%m-%dT%H:%M:%SZ > "$STATE_DIR/launched"
    git -C "$REPO" rev-parse HEAD > "$STATE_DIR/commit"
    : > "$STATE_DIR/webapp.log"
    : > "$STATE_DIR/server.log"

    log "starting webapp watcher in tmux session $WEBAPP_SESSION"
    start_session "$WEBAPP_SESSION" "$REPO/webapp" "make run" "$STATE_DIR/webapp.log"
    log "starting server (postgres + redis via docker) in tmux session $SERVER_SESSION"
    start_session "$SERVER_SESSION" "$REPO/server" "ENABLED_DOCKER_SERVICES=\"postgres redis\" RUN_SERVER_IN_BACKGROUND=false make run-server" "$STATE_DIR/server.log"

    wait_for "server ping" "$SERVER_READY_TIMEOUT" ping_ok "$SERVER_SESSION"
    wait_for "webapp build" "$WEBAPP_READY_TIMEOUT" webapp_compiled "$WEBAPP_SESSION"
    wait_for "webapp served on :8065" 120 webapp_served "$WEBAPP_SESSION"

    log "seeding sysadmin + team ad-1 and proving a browser login (journey: smoke)"
    cmd_drive smoke
    log "READY at $BASE_URL (sysadmin / Sys@dmin-sample1)"
}

cmd_doctor() {
    local ok=true
    check() {
        if eval "$2" >/dev/null 2>&1; then printf '  ok    %s\n' "$1"; else printf '  FAIL  %s\n' "$1"; ok=false; fi
    }
    printf 'verify-mattermost doctor (state: %s)\n' "$STATE_DIR"
    check "launch recorded by this skill" "[ -f '$STATE_DIR/launched' ]"
    check "tmux session $SERVER_SESSION alive" "session_alive $SERVER_SESSION"
    check "tmux session $WEBAPP_SESSION alive" "session_alive $WEBAPP_SESSION"
    check "port 8065 owned by a process under $SERVER_SESSION" "port_8065_is_ours"
    check "containers ${CONTAINERS[*]} running" "containers_running"
    check "server ping status OK (db + filestore)" "ping_ok"
    check "webapp build finished" "webapp_compiled"
    check "webapp HTML served at $BASE_URL/" "webapp_served"
    check "sysadmin can log in via API" "admin_login_ok"
    if [ -f "$STATE_DIR/commit" ]; then
        local launched_at head
        launched_at="$(cat "$STATE_DIR/commit")"
        head="$(git -C "$REPO" rev-parse HEAD)"
        if [ "$launched_at" = "$head" ]; then
            printf '  ok    launched from HEAD %s\n' "${head:0:12}"
        else
            printf '  WARN  launched from %s, HEAD is now %s (server is go run, not hot-reloaded; webapp is watched)\n' "${launched_at:0:12}" "${head:0:12}"
        fi
    fi
    curl -fsS --max-time 5 "$BASE_URL/api/v4/system/ping?get_server_status=true" 2>/dev/null | sed 's/^/  ping  /' || true
    echo
    $ok && echo "HEALTHY" || { echo "UNHEALTHY"; return 1; }
}

descendants() {
    local pid="$1" child
    for child in $(pgrep -P "$pid" 2>/dev/null); do
        descendants "$child"
        echo "$child"
    done
}

port_8065_is_ours() {
    local pid listener
    [ -f "$STATE_DIR/$SERVER_SESSION.pid" ] || return 1
    pid="$(cat "$STATE_DIR/$SERVER_SESSION.pid")"
    listener="$(port_owner 8065 | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)"
    local tree
    tree="$(descendants "$pid")"
    [ -n "$listener" ] && grep -qx "$listener" <<< "$tree"
}

containers_running() {
    local c
    for c in "${CONTAINERS[@]}"; do
        [ "$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null)" = "true" ] || return 1
    done
}

admin_login_ok() {
    curl -fsS --max-time 5 -o /dev/null -X POST "$BASE_URL/api/v4/users/login" \
        -H 'Content-Type: application/json' \
        -d "{\"login_id\":\"${PW_ADMIN_USERNAME:-sysadmin}\",\"password\":\"${PW_ADMIN_PASSWORD:-Sys@dmin-sample1}\"}"
}

cmd_drive() {
    local journey="${1:-}"
    [ -n "$journey" ] || die "usage: drive <journey> [playwright args]; journeys: $(ls "$SKILL_DIR/journeys" | sed 's/\.spec\.ts$//' | tr '\n' ' ')"
    shift
    local spec="$SKILL_DIR/journeys/$journey.spec.ts"
    [ -f "$spec" ] || die "no journey $spec"
    use_toolchain
    ping_ok || die "server at $BASE_URL is not answering; run doctor"

    local run_id="${VERIFY_MM_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
    # Playwright writes traces and screenshots while the test runs; on a slow network mount
    # (a Project store) that stalls the test past its timeout, so it always writes to local disk.
    export VERIFY_MM_EVIDENCE="$LOCAL_EVIDENCE_ROOT/$run_id/$journey"
    mkdir -p "$VERIFY_MM_EVIDENCE"
    log "driving $journey; evidence -> $VERIFY_MM_EVIDENCE"

    local rc
    set +e
    (
        cd "$REPO/e2e-tests/playwright" &&
            NODE_PATH="$PWD/node_modules" PW_BASE_URL="$BASE_URL" PW_HEADLESS="${PW_HEADLESS:-true}" \
                npx playwright test --config "$SKILL_DIR/playwright.verify.config.ts" "$spec" "$@"
    ) 2>&1 | tee "$VERIFY_MM_EVIDENCE/playwright.log"
    rc="${PIPESTATUS[0]}"
    set -e

    local dest="$VERIFY_MM_EVIDENCE"
    if [ "$EVIDENCE_ROOT" != "$LOCAL_EVIDENCE_ROOT" ]; then
        dest="$EVIDENCE_ROOT/$run_id/$journey"
        mkdir -p "$dest"
        cp -r "$VERIFY_MM_EVIDENCE/." "$dest/"
    fi
    log "journey $journey exited $rc; evidence in $dest:"
    find "$dest" -type f | sort | sed 's/^/  /' >&2
    return "$rc"
}

kill_tree() {
    local session="$1" pidfile="$STATE_DIR/$1.pid" pid pids
    [ -f "$pidfile" ] || return 0
    pid="$(cat "$pidfile")"
    pids="$(descendants "$pid") $pid"
    log "stopping $session (pids: $(echo $pids | tr '\n' ' '))"
    kill -TERM $pids 2>/dev/null || true
    for _ in $(seq 1 20); do
        kill -0 $pids 2>/dev/null || break
        sleep 1
    done
    kill -KILL $pids 2>/dev/null || true
    session_alive "$session" && tmux_cmd kill-session -t "=$session"
    rm -f "$pidfile"
}

cmd_cleanup() {
    local keep_data=false
    [ "${1:-}" = "--keep-data" ] && keep_data=true
    if [ ! -f "$STATE_DIR/launched" ]; then
        log "nothing recorded in $STATE_DIR; refusing to stop anything this skill did not launch"
        return 0
    fi
    kill_tree "$SERVER_SESSION"
    kill_tree "$WEBAPP_SESSION"
    if $keep_data; then
        log "stopping containers ${CONTAINERS[*]} (keeping postgres volume $(pg_volumes))"
        docker stop "${CONTAINERS[@]}" >/dev/null 2>&1 || true
        docker rm "${CONTAINERS[@]}" >/dev/null 2>&1 || true
        pg_volumes > "$KEPT_DATA_MARKER"
    else
        local volumes
        volumes="$(pg_volumes)"
        log "removing containers ${CONTAINERS[*]} with their anonymous volumes, and postgres volume $volumes"
        docker rm -fv "${CONTAINERS[@]}" >/dev/null 2>&1 || true
        [ -z "$volumes" ] || docker volume rm $volumes >/dev/null
        rm -f "$KEPT_DATA_MARKER"
        rm -rf "$REPO/server/data"
    fi
    rm -rf "$REPO/e2e-tests/playwright/.verify-results"
    rm -rf "$STATE_DIR"
    log "cleanup done; evidence kept under $EVIDENCE_ROOT"
}

case "${1:-}" in
    launch) shift; cmd_launch "$@" ;;
    doctor) shift; cmd_doctor "$@" ;;
    drive) shift; cmd_drive "$@" ;;
    cleanup) shift; cmd_cleanup "$@" ;;
    *) sed -n '2,8p' "$0"; exit 2 ;;
esac
