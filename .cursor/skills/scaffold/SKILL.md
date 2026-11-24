---
name: scaffold
description: Read temp-docs/<TICKET ID>-plan.md and write failing tests (Go model/app/api4 and webapp jest) for the planned behavior, plus only the minimal stubs needed so the tests compile and fail on assertions. Use as step 2 of the Code Factory loop, after the plan skill, in the Mattermost repo.
---

# scaffold

Write tests for the expected behavior before any real code exists. Every test function must compile, run and
fail on an assertion. A compile error, a panic, a setup error or a passing test function does not count.

## Inputs

- `temp-docs/<TICKET ID>-plan.md` (the "Tests" and "Edge cases" sections are the checklist).
- The branch from the plan (Linear's `gitBranchName`). Create it before writing files.

## Where tests go

| Layer | Test file | Helpers |
| --- | --- | --- |
| Model | `server/public/model/<feature>_test.go` (package `model`) | testify `assert`/`require` |
| App | `server/channels/app/<area>_<feature>_test.go` | `mainHelper.Parallel(t)`, `Setup(t).InitBasic(t)`, `th.Context`, `th.BasicUser`, `th.BasicUser2`, `th.CreateUser(t)` |
| API | `server/channels/api4/<area>_<feature>_test.go` | `th.Client`, `th.SystemAdminClient`, `th.SystemManagerClient` (+ `th.LoginSystemManager(t)`), `th.TestForSystemAdminAndLocal`, `th.LoginBasic2(t)`, `CheckOKStatus`/`CheckBadRequestStatus`/`CheckForbiddenStatus`/`CheckNotFoundStatus`/`CheckUnauthorizedStatus`, `assertExpectedWebsocketEvent`, `th.CreateConnectedWebSocketClientWithClient` |
| Webapp client | `webapp/platform/client/src/client4.test.ts` (new `describe` block) | `nock(client.getBaseRoute())`, `await expect(promise).resolves.toEqual(...)` |
| Webapp redux/components | next to the source file, `*.test.ts(x)` | `renderWithContext` from `tests/react_testing_utils` |

Put new Go tests in a new file named for the feature instead of growing `user_test.go` (12k+ lines). Before you
add a package-level `const` or helper, `rg` the package for the name; `dayMillis` already exists in `app`.

## Stubs so tests compile

Go fails to build when a test references a missing symbol, so add the smallest stub for each new symbol:

- Model types and constants: write the real struct, JSON tags and constants (they are the contract). Make methods
  return wrong values: `IsValid()` returns `NewAppError(..., "not_implemented", ..., 501)`, booleans return `false`,
  getters return `nil`, setters do nothing.
- App methods: correct signature, return a 501 `not_implemented` AppError.
- API routes: do **not** register them. Unregistered routes return 404, so API tests fail on status assertions.
- Go `Client4` and webapp `Client4` methods: these are the API tests' harness. Write the Go ones for real; a stub
  that returns `nil` resp makes `Check*Status` panic instead of failing. Webapp client methods are the unit under
  test, so stub them with `Promise.reject(...)` and assert with `resolves`/`rejects`, which fails as an assertion.

## Test content rules

- Cover every acceptance criterion and every edge case in the plan: boundaries on both sides (one unit before, at,
  and after), each validation rule with its specific error id, each permission tier (self, another user, admin
  plus local mode, a role with the specific permission, a protected target such as a system admin),
  unauthenticated 401, malformed body, idempotent deletes, websocket events, and side doors such as `/patch`.
- Assert specific error ids (`appErr.Id`) and status codes, not just "an error".
- For "nothing changes" cases, assert on stored state (for example `UpdateAt` unchanged, prop still nil).

## Run and check

Backing services first (see the validate skill for setup): Postgres on 5432 (`mmuser` / `mostest_password` /
`mattermost_test`) and Redis on 6379. Without Redis, api4 `Setup` fails with
`unable to create cache provider`. That is a setup failure, not an assertion failure; fix it and rerun.

```bash
cd server/public && go test ./model/ -run '<Feature>' -count=1
cd server && go test ./channels/app/ -run '<TestName>$' -count=1
cd server && go test ./channels/api4/ -run '<TestPrefix>' -count=1
cd webapp/platform/client && npx jest src/client4.test.ts -t '<describe name>'
```

Filter Go output with `grep -E "^\s*--- |^(ok|FAIL)|panic|Error:"` and read the `Error:` lines.

- Every top-level test function must FAIL. When one passes, the stub accidentally matches; make the stub wronger or
  the test stronger.
- Individual subtests may pass when the stub happens to give the right answer (for example a 404 from an unregistered
  route on a "not found" test, or `false` from a stub on an "inactive" case). That is fine; list them in your report.
- No failure may come from compile errors, panics or `Setup` errors.

## Report

The test files written, the stubs added, and per package: test functions failing / total, plus any subtests that
pass against the stubs.
