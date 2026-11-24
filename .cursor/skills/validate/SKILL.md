---
name: validate
description: Run the relevant Mattermost test suites, then exercise the change against a real running server (and webapp when UI is in scope) the way a user would, check the resulting state against temp-docs/<TICKET ID>-plan.md, and save proof to temp-docs/<TICKET ID>-artifacts/. Use as step 4 of the Code Factory loop, after implement. Report failures back to implement.
---

# validate

Prove the change works with real suites and a real server, not just the new unit tests. Spend the most effort
here; reliable proof is what makes review fast. If anything fails because of the change, stop and hand the failure
(command, output, expected vs actual) back to the implement skill.

## 0. Prefer the repo's verification skill

If `.cursor/skills/verify-mattermost/SKILL.md` exists (or `git fetch origin && git branch -r | grep -i verify` shows a
branch carrying it), follow it for starting the app and capturing evidence, and use the steps below only for what
it does not cover.

## 1. Backing services

`make start-docker` needs Docker and Docker Hub pulls. In Cursor Cloud the egress policy can block image layer
downloads (S3 `EOF`). If Docker is missing or pulls fail, install the services natively:

```bash
sudo apt-get install -y postgresql redis-server
sudo pg_ctlcluster 16 main start
sudo sed -i 's/^max_connections = .*/max_connections = 500/' /etc/postgresql/16/main/postgresql.conf
sudo pg_ctlcluster 16 main restart
sudo -u postgres psql -c "CREATE USER mmuser WITH SUPERUSER PASSWORD 'mostest_password';" \
  -c "CREATE DATABASE mattermost_test OWNER mmuser;" -c "CREATE DATABASE mattermost_dev OWNER mmuser;"
sudo service redis-server start
```

These match `model.SqlSettingsDefaultDataSource`. api4 tests need Redis (`unable to create cache provider` otherwise).
Email tests need inbucket (port 9001) and SMTP (10025); without them a few email tests fail. Prove that they also
fail on master (step 2) instead of ignoring them.

## 2. Test suites

Run in tmux sessions; the broad suites take several minutes.

```bash
cd server/public && go test ./model/ -count=1
cd server && go test ./channels/app/  -run '<Area>|<Feature>' -count=1 -timeout 60m
cd server && go test ./channels/api4/ -run '<Area>|<Feature>' -count=1 -timeout 60m
cd webapp/platform/client && npx jest src/client4.test.ts      # plus any touched webapp test files
cd webapp/platform/<pkg> && npm run check && npx tsc --noEmit -p tsconfig.json
gofmt -l <changed files>; go vet <changed packages>
```

Pick `-run` patterns for every area the change touches (for user props: `User|Status`). `grep -E "^--- FAIL"` the
log. For each failure, decide whether it is yours: run the same tests on a clean master worktree
(`git worktree add /tmp/mm-master master && cd /tmp/mm-master/server && make setup-go-work`; without `go.work` the
build picks a published `public` module and fails). Same failure on master means environmental; record it.

`make golangci-lint` may refuse to run when the pinned binary's Go version is older than the module's. Record it as
not run and leave lint to CI; do not upgrade the linter in a feature branch.

## 3. Run the real app

```bash
cd server && MM_NO_DOCKER=true \
  MM_SQLSETTINGS_DATASOURCE='postgres://mmuser:mostest_password@localhost/mattermost_dev?sslmode=disable&connect_timeout=10&binary_parameters=yes' \
  MM_SERVICESETTINGS_SITEURL=http://localhost:8065 MM_SERVICESETTINGS_ENABLELOCALMODE=true \
  MM_TEAMSETTINGS_ENABLEOPENSERVER=true MM_EMAILSETTINGS_REQUIREEMAILVERIFICATION=false \
  make run-server          # in tmux; ready when GET /api/v4/system/ping returns 200
```

Use a separate `mattermost_dev` database so the server does not share state with test runs. Restart the server after
every code change before re-running the journey. For UI tickets also run `cd webapp && make run` (Node from `.nvmrc`,
see the implement skill) and capture screenshots or a recording of each step.

## 4. The user journey

Write `temp-docs/<TICKET ID>-artifacts/e2e.sh`: a rerunnable script that creates its own users (unique per run),
performs each acceptance-criterion step as the right actor, and prints every request, response and PASS/FAIL
line, ending in a summary and a non-zero exit on failure. Cover:

- Every acceptance criterion, as each permission tier (self, other user, admin, unauthenticated).
- Every 400 rule, checking the **error id and that `message` is translated (not equal to the id)**. That check
  caught missing i18n strings that the unit tests passed.
- Resulting state: the API read-back, what other users see (for example profile `props`), and the database row
  (`psql "$PG_DSN" -c ...`).
- Websocket events: a `node -e` client (Node 22+ has a global `WebSocket`) that authenticates with
  `authentication_challenge` and records the events, including the absence of an event for no-op calls.
- A promoted admin, through `server/bin/mmctl --local roles system-admin <user>` when the first user is not admin.

Credentials: read them from environment variables by name (for example `TEST_USER_PASSWORD`); never hard-code them.
Send request logging to stderr (so `$(...)` captures stay clean) and mask passwords in the log. Grep the saved
log for the password before keeping it.

## 5. Save proof

In `temp-docs/<TICKET ID>-artifacts/`: `e2e.sh`, `e2e-log.txt`, `test-results.md` (a table of suite, command and
result, including environmental failures with the master baseline and anything not run), suite summaries, and
screenshots or recordings for UI. Copy the key files to the Project store's `media/<TICKET ID>/` when the assignment
asks.

## Check before finishing

- The suites pass, or every failure is shown to fail on master too.
- The journey log shows each acceptance criterion working, with state checked against the plan's contract.
- Any defect found here is fixed through implement, the fix is committed, and the journey is re-run green.
