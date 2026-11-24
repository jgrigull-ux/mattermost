---
name: plan
description: Read one Linear ticket (FED-*) and write an ordered, deep technical implementation plan to temp-docs/<TICKET ID>-plan.md without implementing anything. Use as step 1 of the Code Factory loop, or when asked to plan or scope a Linear ticket in the Mattermost repo.
---

# plan

Turn one Linear ticket into an implementation plan that the scaffold, implement and validate skills can follow.
Do not write product code or tests in this step.

## Inputs

- A ticket ID such as `FED-363`.
- Linear MCP tools (`Linear` namespace). If they are unavailable, stop and ask the user to paste the ticket.

## Steps

1. **Read the ticket**: `get_issue` for the ticket, then `list_comments` for the discussion (get_issue does not
   include comments). Note `gitBranchName`: that is the branch name to use, so Linear links the PR automatically.
2. **Read its neighbors.** List the tickets that share its labels or project (`list_issues` with `label`/`team`) and
   `get_issue` every ticket that depends on it or that it depends on. The descriptions are truncated in
   `list_issues`. Downstream tickets tell you what the API shape must support. For example, FED-367 falls back to a
   default auto-reply message, so FED-363 must allow an empty message.
3. **Find the in-repo template.** Tickets usually name a pattern ("modelled on custom status"). Read that pattern
   end to end before designing: model file, `User` props helpers, app methods, api4 handler, Client4, tests.
   `rg` for the pattern's names across `server/` and `webapp/platform/`.
4. **Trace side doors.** For every new piece of state, find other paths that can write it. For data stored in
   `User.Props`, `PUT /users/{id}/patch` replaces the whole map, so validation must also run in `User.IsValid`.
5. **Write `temp-docs/<TICKET ID>-plan.md`** (create `temp-docs/` if missing and confirm `temp-docs/` is in
   `.gitignore`). Use these sections:
   - Goal (two or three sentences).
   - **Contract**: exact JSON field names, props keys, routes, status codes, and the permission rule, in a table.
     Downstream tickets read this, so freeze it here.
   - **Subtasks in order**, each naming files and functions and saying what it depends on.
   - **Tests** scaffold should write, per layer, with the cases listed.
   - **Edge cases**: boundaries (inclusive or exclusive), empty and missing values, permissions, idempotency,
     deactivated or unknown referenced users, data that expires without anything clearing it.
   - **Downstream effects** on each dependent ticket: what it reads, what it must handle.
   - **Risks and tradeoffs** to raise in the review (privacy and visibility, side doors, accepted gaps).

## Mattermost checklist (add each item that applies as a subtask)

- New `App` methods need no generated layer in this repo version (`make app-layers` and `app_iface.go` are gone);
  check `server/Makefile` before naming a generator. Store or plugin API changes need `make layers`.
- Local mode: if admins can act through local mode, plan the routes in `server/channels/api4/<area>_local.go` too.
- New error ids: add to `server/i18n/en.json` with a translator `description`, then `make i18n-extract`
  (server/AGENTS.md). Never `go mod tidy`; use `make modules-tidy`.
- New API route: register on `api.BaseRoutes.*` in `server/channels/api4/`, permission check through
  `c.App.SessionHasPermissionTo*`, audit record for writes (`model.AuditEvent*` in `server/public/model/audit_events.go`).
- Go `Client4` method in `server/public/model/client4.go`, webapp `Client4` method in
  `webapp/platform/client/src/client4.ts`, and types in `webapp/platform/types/src/`.
- OpenAPI docs in `api/v4/source/*.yaml`.
- Websocket: `App.UpdateUser(rctx, user, true)` already publishes `user_updated`; reuse it instead of a new event.
- `SessionHasPermissionToUser` gives self, `manage_system` and local mode access, and `edit_others_users` for
  non-admin targets. State that rule in the plan instead of inventing a new one.

## Check before finishing

- Every acceptance criterion in the ticket maps to at least one subtask and one test.
- Every downstream ticket has a line saying what it needs from this one.
- Each decision the ticket left open (status codes, empty values, boundaries) is stated, not implied.
