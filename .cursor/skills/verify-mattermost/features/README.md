# Mattermost verification map

This directory is the maintained source for verifying the user-facing behavior of the Mattermost web app. Read this index before driving the app, then use the matching feature file as the recipe. Commands below are relative to the repo root; `vm` stands for `.cursor/skills/verify-mattermost/scripts/verify-mattermost.sh`.

## Baseline preconditions

- Launch with `vm launch` and wait for `READY at http://localhost:8065`. This starts the server (Team Edition unless `mattermost/enterprise` is checked out next to the repo) with postgres and redis in Docker, and the webpack-watched webapp.
- `vm doctor` reports `HEALTHY`. Never drive an instance this skill did not launch: Playwright fixtures reset server config and roles before every test.
- Seed data: Playwright global setup guarantees `sysadmin` / `Sys@dmin-sample1` and team `ad-1`. Each journey creates its own user and team with `pw.initSetup()`, plus any other actors it needs through the API.
- Evidence goes to `$VERIFY_MM_EVIDENCE_DIR/<run-id>/<journey>/` (default `$HOME/verify-mattermost-evidence`).

## Driving conventions

- Every feature has a journey in `journeys/<id>.spec.ts`; run it with `vm drive <id>`. Write new checks as journeys, not ad-hoc scripts, so the next run can repeat them.
- Act through the UI as the logged-in user (`pw.testBrowser.login(user)`). Use the API (`adminClient`, `pw.makeClient`) only to seed preconditions and read back side effects.
- Prefer ARIA roles and accessible names, `data-testid`s, and the page objects in `e2e-tests/playwright/lib/src/ui/` over CSS classes or DOM position. Check a page object's locator against the DOM before trusting it; some are stale (see account menu Gotchas).
- Take screenshots with `capture(page, name)` so menu and popover animations have finished.
- Leave server-wide config as you found it: `adminClient.patchConfig` inside a test is reverted by the fixture after the test.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof is a named screenshot plus a passing journey line in `playwright.log`.
- Mutation proof includes an API read of the stored value (status, user props, posts).
- Record the journey id and entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition (for example a license-gated feature on Team Edition).
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify-mattermost` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact locator or command and the observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

## Features

- [Sign in and channel view](./sign-in-and-channel-view.md) covers the login page, landing on Town Square, and the global header. Journey: `smoke` (also run by `launch`).
- [Profile popover](./profile-popover.md) covers opening another user's popover from an avatar or username, the profile fields it shows, and messaging the user from it. Journey: `profile-popover`.
- [Account menu and status](./account-menu-status.md) covers the avatar menu in the global header: Online, Away, Do not disturb with expiry, Offline, Out of office, and custom status. Journey: `account-menu-status`.
- [Message composer](./message-composer.md) covers typing and sending, multi-line input, @mention autocomplete, per-channel drafts, and the Out of office warning in DMs. Journey: `message-composer`.

## Baseline captures

- `scheduled-leave-before` captures the profile popover, a DM channel header, the account menu (normal and while Out of office) and the composer's Out of office warning in one seeded two-user DM. These are the surfaces the scheduled-leave tickets (FED-363 to FED-367) change. Run it on the base commit and on the branch for before/after screenshots.
