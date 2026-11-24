---
name: verify-mattermost
description: "Launch a local Mattermost (Go server on :8065 + webpack-watched webapp, postgres/redis in Docker), drive the web UI as a real user with the repo's Playwright page objects, and capture screenshot/API evidence. Use to prove a UI or server change works end to end (profile popover, account menu/status, message composer, sign-in), to take before/after screenshots for a PR, or when asked to verify Mattermost behavior in a browser."
---

# verify-mattermost

> **Fresh cloud VM workarounds** (all handled by `launch` or listed under Prerequisites; this is what to expect):
> - **Docker images:** restricted egress reaches Docker Hub's registry but not its blob store, so `postgres:15` and `redis:7.4.0` fail with `error pulling image configuration ... EOF`. `launch` pulls the same official images from `public.ecr.aws/docker/library/` and tags them with the Docker Hub names.
> - **wait-for-dep stand-in:** `mattermost/mattermost-wait-for-dep:latest` exists only on Docker Hub. `launch` builds a local stand-in with the same name from `scripts/wait-for-dep/` (busybox from ECR Public; it waits for each `host:port`).
> - **Team Edition:** a fork without access to `mattermost/enterprise` builds the server as Team Edition (`TEAM EDITION` badge, `BuildEnterpriseReady=false`). Install with `CLOUD_AGENT_SKIP_ENTERPRISE=true`. License-gated features are unavailable, so report them as skipped.
> - **Toolchain:** `go.dev` may be blocked, so fetch Go from `dl.google.com/go/`. Without systemd, start `dockerd` through `.cursor/scripts/cloud-agent-start.sh` with fuse-overlayfs and legacy iptables (see Prerequisites).
> - **Background server:** `server/config.mk` defaults `RUN_SERVER_IN_BACKGROUND=true`. `launch` forces `false` so cleanup can stop the server it started.

Drives the primary surface, the Mattermost web app served by the server at `http://localhost:8065`, through the repo's own Playwright harness (`e2e-tests/playwright`, `@mattermost/playwright-lib` page objects). Other surfaces (mmctl, REST API, mobile) are only used here to seed data and confirm side effects.

One helper does everything; run it from the repo root:

```bash
.cursor/skills/verify-mattermost/scripts/verify-mattermost.sh launch                # start + wait until usable + seed
.cursor/skills/verify-mattermost/scripts/verify-mattermost.sh doctor                # read-only health check
.cursor/skills/verify-mattermost/scripts/verify-mattermost.sh drive <journey> [pw args]
.cursor/skills/verify-mattermost/scripts/verify-mattermost.sh cleanup [--keep-data]
```

Journeys are `journeys/<journey>.spec.ts`; the map in [`features/README.md`](features/README.md) says which one proves which feature.

## Prerequisites (once per VM)

- Toolchain from the repo's install hook: `bash .cursor/scripts/cloud-agent-install.sh` (Go from `server/.go-version`, Node from `.nvmrc` via nvm, `webapp` and `e2e-tests/playwright` `npm ci`, Playwright Chromium). Set `CLOUD_AGENT_SKIP_ENTERPRISE=true` when `mattermost/enterprise` is not readable; the server then builds as Team Edition (`BuildEnterpriseReady=false`) and license-gated features are absent.
- Docker running: `bash .cursor/scripts/cloud-agent-start.sh`. On a VM without systemd and without the repo's Dockerfile image, install `docker.io docker-compose-v2 fuse-overlayfs` from apt, set `{"storage-driver":"fuse-overlayfs"}` in `/etc/docker/daemon.json`, switch `iptables`/`ip6tables` to the `-legacy` alternatives, run the start hook, then `sudo chmod 666 /var/run/docker.sock` if `docker info` is denied.
- If `go.dev` is blocked, fetch Go from `https://dl.google.com/go/go<version>.linux-amd64.tar.gz` into `/usr/local/go`.

## Launch

`verify-mattermost.sh launch` runs the user's documented split-terminal flow in two tmux sessions it owns:

- `verify-mm-webapp`: `cd webapp && make run` (webpack `--watch` into `webapp/channels/dist`, which the server serves through the `server/client` symlink).
- `verify-mm-server`: `cd server && ENABLED_DOCKER_SERVICES="postgres redis" RUN_SERVER_IN_BACKGROUND=false make run-server`. `server/config.mk` defaults `RUN_SERVER_IN_BACKGROUND=true`, which detaches `go run` from the session; the helper pins it to `false` so the server stays a child it can stop.

Before starting, it refuses if `/tmp/verify-mattermost/launched` exists, if ports 8065/5432/6379 are taken, if `mattermost-postgres`/`mattermost-redis` containers already exist (they belong to someone else's instance), or if a postgres data volume exists that a `cleanup --keep-data` did not record (it would not be an empty database). It also makes sure `postgres:15`, `redis:7.4.0` and `mattermost/mattermost-wait-for-dep:latest` are present; when Docker Hub blobs are unreachable it pulls the same official images from `public.ecr.aws/docker/library/` and builds a stand-in for wait-for-dep from `scripts/wait-for-dep/` (verification scaffolding with the same "wait for each host:port" contract).

Ready means usable, checked in this order (logs in `/tmp/verify-mattermost/{server,webapp}.log`):

1. `GET /api/v4/system/ping?get_server_status=true` returns `"status":"OK"` (database and filestore healthy; migrations done). First boot compiles the server, allow up to 20 minutes; a warm Go cache takes seconds.
2. The webapp log prints `webpack ... compiled successfully` or `compiled with N warnings` (about 30 s warm, several minutes cold).
3. `GET /` returns the webapp HTML containing `id='root'`.
4. The `smoke` journey passes: Playwright global setup creates `sysadmin` / `Sys@dmin-sample1` and team `ad-1` on an empty database, then a fresh user logs in through the login page and lands on Town Square.

The helper prints `READY at http://localhost:8065` when all four hold. Teardown is `cleanup`, below.

Only one instance per VM: container names, the postgres data volume, and ports are fixed by `server/docker-compose.makefile.yml`. Never drive an instance this skill did not launch (for example, one a user started by hand); Playwright's fixtures reset server config and roles before every test.

## Doctor

`verify-mattermost.sh doctor` is read-only and prints `ok`/`FAIL` per line, then `HEALTHY` or `UNHEALTHY` (exit 1):

- launch recorded in `/tmp/verify-mattermost`, both tmux sessions alive;
- port 8065 is held by a process under `verify-mm-server` (not some other server);
- both containers running; ping `OK`; webapp built and served; `sysadmin` can log in through `POST /api/v4/users/login`;
- launched-from commit vs current `HEAD` (the server is `go run` and is not hot-reloaded, so a server change needs `cleanup --keep-data` then `launch`; webapp changes are picked up by the watcher, wait for the next `compiled` line).

Run it first whenever anything looks off.

## Drive

`verify-mattermost.sh drive <journey>` runs `npx playwright test` from `e2e-tests/playwright` with `playwright.verify.config.ts` (in this skill), `NODE_PATH` pointing at that package's `node_modules`, `PW_BASE_URL=http://localhost:8065`, and headless Chromium (`PW_HEADLESS=false` to watch). The config reuses the repo's `global_setup.ts`, runs one worker, and records a trace on failure. Playwright's automatic screenshots are off because they capture the unused default `page` fixture and come out blank; journeys take their own with `capture()`.

Write journeys with the same building blocks as the repo's specs:

- `const {user, team, adminClient} = await pw.initSetup()` creates a fresh user and team per run, so journeys never collide with each other or with earlier runs.
- Seed other actors through the API: `adminClient.createUsers(team.id, 1, 'prefix')`, `pw.makeClient(user)`, `client.createPost(...)`, `adminClient.createDirectChannel([a, b])`, `adminClient.patchConfig(...)`.
- Drive the UI as that user: `const {channelsPage, page} = await pw.testBrowser.login(user)`, then page objects such as `channelsPage.openProfilePopover(post)`, `channelsPage.openUserAccountMenu()`, `channelsPage.centerView.postCreate`. Selectors live in `e2e-tests/playwright/lib/src/ui/`; prefer ARIA roles, names and `data-testid`s.
- Capture with `capture(page, 'name.png')` from `journeys/evidence.ts`, which waits for running animations to finish (menus fade in) and writes into the run's evidence directory.

Pass extra Playwright flags after the journey, for example `drive profile-popover --headed` or `drive message-composer --debug`. Use `page` from `pw.testBrowser.login`, not the default `page` fixture, which is never logged in. Read `error-context.md` (an ARIA snapshot) and `trace.zip` (`npx playwright show-trace <path>`) for failures.

## Evidence

Each drive writes to `$VERIFY_MM_EVIDENCE_DIR/<run-id>/<journey>/` (default `$HOME/verify-mattermost-evidence`, run id is a UTC timestamp unless `VERIFY_MM_RUN_ID` is set): the journey's named PNGs, `playwright.log` with the pass/fail list, and `playwright-output/` with traces and `error-context.md` on failure. Point `VERIFY_MM_EVIDENCE_DIR` at a durable location (for example a Project store `media/` folder) when the proof must outlive the VM. Playwright always writes to `$HOME/verify-mattermost-evidence/<run-id>/<journey>/` while the test runs, and `drive` copies that directory to `VERIFY_MM_EVIDENCE_DIR` afterwards. Writing traces straight to a network-mounted store stalls the test past its timeout.

Proof standards:

- Exercise the real user path: log in through the login page, click the avatar, open the menu, type in the composer. Use the API only to seed preconditions and to read back side effects, never to perform the action under test.
- Capture the action and the resulting state (menu open, then the status it set), not only the final screen.
- Verify side effects alongside what is visible: `adminClient.getStatus(id)` for status changes, `adminClient.getUser(id).props.customStatus` for custom status, `adminClient.getPosts(channelId)` for messages sent and drafts not sent.
- No mocks: this stack has no external systems in the paths mapped here.
- For before/after PR screenshots, run the same journey on the base commit and on the branch and keep both evidence directories.

## Cleanup

`verify-mattermost.sh cleanup` stops only what `launch` recorded: it kills the process trees under the two tmux sessions' recorded pane PIDs (TERM, then KILL after 20 s), closes the sessions, removes `mattermost-postgres` and `mattermost-redis` with their anonymous volumes and the postgres data volume (found by label `com.docker.compose.volume=postgres-15-data`; compose names it `mattermost-server_postgres-15-data`), so the next launch starts from an empty database. It also deletes `server/data` and removes `/tmp/verify-mattermost`. `--keep-data` removes the containers but keeps the data volume and records it in `/tmp/verify-mattermost.kept-data`, so the next `launch` reuses it instead of refusing. It never touches the evidence directory, and it refuses to stop anything when no launch is recorded. Do not use `make stop-server` or `make stop`: they kill every `go run`/webpack process on the machine by name.

Run cleanup after every failed launch too, so a half-started stack does not hold ports for the next attempt.

## Helpers

- `scripts/verify-mattermost.sh`: launch / doctor / drive / cleanup, as above. Environment overrides: `VERIFY_MM_EVIDENCE_DIR`, `VERIFY_MM_RUN_ID`, `VERIFY_MM_STATE_DIR` (default `/tmp/verify-mattermost`), `VERIFY_MM_SERVER_TIMEOUT`, `VERIFY_MM_WEBAPP_TIMEOUT`, `PW_HEADLESS`.
- `scripts/wait-for-dep/`: Dockerfile and script for the wait-for-dep stand-in; `launch` builds it only when the real image cannot be pulled.
- `playwright.verify.config.ts`: the Playwright config `drive` uses. Do not run it without the helper; it needs `NODE_PATH` set.
- `journeys/evidence.ts`: `capture(page, name)` and `evidencePath(name)`.

## Keeping the map honest

The feature map is this repo's maintained verification source. When a change touches a mapped feature, drive its journey, and update the feature file and journey in the same PR when handles or behavior change. Use `/maintain-verification-skill` to keep the map current as the app evolves.
