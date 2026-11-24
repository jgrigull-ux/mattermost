---
name: implement
description: Read temp-docs/<TICKET ID>-plan.md and the scaffolded failing tests, replace the stubs with real code, and iterate until those tests pass without editing them. Use as step 3 of the Code Factory loop in the Mattermost repo, after the scaffold skill.
---

# implement

Make the scaffolded tests pass by writing product code. The tests are the spec: do not edit them to make them pass.

## Inputs

- `temp-docs/<TICKET ID>-plan.md`.
- The scaffold commit (tests and stubs). Record its SHA; it is the baseline for the "tests unchanged" check.

## Steps

1. Replace stubs layer by layer, bottom up, running that layer's tests after each:
   model, then app, then api4 (routes, handlers, local-mode routes), then clients.
2. Follow the in-repo pattern named in the plan. For Mattermost:
   - api4 handler order: `c.RequireUserId()`, decode body (`c.SetInvalidParamWithErr`), audit record
     (`c.MakeAuditRecord` + `defer c.LogAuditRec`, `auditRec.Success()` at the end), permission check, app call,
     encode response (`json.NewEncoder(w).Encode`, log a write error with `c.Logger.Warn`) or `ReturnStatusOK(w)`.
   - **Local mode routes live in `server/channels/api4/<area>_local.go`** (`api.APILocal(handler)`). If a test uses
     `th.TestForSystemAdminAndLocal` or `th.LocalClient`, register the route there too.
   - Audit event constants go in `server/public/model/audit_events.go`, alphabetical within their section. Give
     audited structs an `Auditable()` method that leaves out free-text user content.
   - Map a lookup's 404 to the right domain error (for example "backup user invalid", 400) and pass other errors on.
3. Do the plan's housekeeping subtasks:
   - **i18n**: add each new error id to `server/i18n/en.json` with a translator `description`. The plan names
     `make i18n-extract`, but **when `../enterprise` is not checked out, extract deletes keys used only by enterprise
     code** (even with `--contributor`). In that case insert entries in sorted id order yourself, then run
     `./bin/mmgotool i18n extract --portal-dir="" --contributor` on a copy and confirm that the only ids it drops
     are pre-existing ones and that its output is a subset of yours. Never commit the deletions.
   - **Error ids must be string literals passed directly to `NewAppError` (second argument) or `T(...)`.**
     The extractor (`tools/mmgotool/commands/i18n.go`, `extractByFuncName`) reads only literals in those call
     positions. An id built by concatenation or passed through your own helper is treated as unused: extract deletes
     its translation and the API returns the raw id as `message`. Unit tests on `appErr.Id` do not catch this;
     validate does, by checking that `message != id`.
   - There is no generated App interface in this repo version (`make app-layers` does not exist). Run
     `make layers` only when store or plugin API interfaces change, and `make mocks` when a mocked interface changes.
   - OpenAPI: `api/v4/source/*.yaml`; schemas in `definitions.yaml`. Use the next minor version for
     "Minimum server version" (`server/public/model/version.go` lists the current one first). Check YAML parses.
4. Run `gofmt -l` on changed Go files, `go vet` on changed packages.

## When a test seems wrong

A scaffolded test can rest on a false premise (for example, assuming a role has a permission by default; the
system manager role does **not** have `edit_others_users` unless `sysconsole_write_user_management_users` is
granted). Do not change product code to satisfy a false premise, and do not weaken an assertion. Fix only the
premise (set up the precondition explicitly), commit it **separately** with a message explaining why the assertion
is unchanged, and list it in the review summary.

## Check before finishing

```bash
git diff --stat <scaffold-sha> -- '*_test.go' '*.test.ts' '*.test.tsx'   # empty, except listed premise fixes
```

- Every scaffolded test passes (rerun each package with `-count=1`).
- Webapp tests need deps: `cd webapp && npm ci`. The repo pins Node in `.nvmrc`; if `node --version` differs, run
  `nvm install <version>` and put `~/.nvm/versions/node/v<version>/bin` first on `PATH` (a system node may shadow
  `nvm use`).
- Commit the implementation as one commit naming the ticket.
