---
name: request-review
description: Write a review summary for a finished Linear ticket (Why, What changed, Scope, Tradeoffs, Blast radius, Verification, Release Note) with links to the validate proof, push the branch, notify the user, and stop until they approve or give feedback. Use as step 5 of the Code Factory loop, after validate passes, in the Mattermost repo.
---

# request-review

Give the reviewer everything needed to approve or reject without reading every file, then wait.

## Preconditions

- validate passed and its proof is in `temp-docs/<TICKET ID>-artifacts/` (and in the Project store's `media/<TICKET ID>/`
  when assigned).
- The working tree is clean, and every commit names the ticket.

## Write the summary

Write it to the path the assignment names (for example the Project store's `docs/<TICKET ID>-review.md`); otherwise
`temp-docs/<TICKET ID>-review.md`. It doubles as the PR body, so follow the Project's PR description guide when there
is one, plus the repo's `.github/PULL_REQUEST_TEMPLATE.md` rules in `AGENTS.md`. Sections in order:

1. `Resolves <TICKET ID>` on its own line.
2. **Why**: the user problem and root cause in plain sentences.
3. **What changed**: one bullet per file or area, naming functions and what they now do.
4. **Scope**: what is covered, what is left out, and which ticket covers it.
5. **Tradeoffs**: each alternative rejected and why.
6. **Blast radius**: who and what is affected and how behavior changes; call out any change to existing endpoints,
   anything newly visible to other users (privacy), and wholesale-replace side doors.
7. **Verification**: the scaffold commit SHA proving the tests failed first; each test file and what it covers; any
   test edited after scaffold, with its reason; suites with results; environmental failures with the master
   baseline; checks **not** run, named plainly; the live journey with links to `e2e.sh` and `e2e-log.txt`, described as
   a user story (who did what, what they saw); and defects that validation found and how they were fixed.
   Before/after screenshots or video for UI.
8. **Unsure about**: decisions the reviewer should confirm.
9. `#### Release Note` with a fenced `release-note` block, never escaped. Past tense, naming new endpoints, or
   `NONE` when there is no API, schema, UI or breaking change.

Put a short header above `Resolves` with the branch, repo and head SHA. Link to evidence by absolute path, and use
full or short SHAs rather than branch names for anything that must stay accurate.

## Push and notify

- `git push -u origin <branch>`. The branch name is Linear's `gitBranchName`, so Linear links the PR.
- Check `git remote -v` and the user's standing instructions for the target repo. In this Project, PRs target the
  user's fork or repo named in the instructions, **never upstream `mattermost/mattermost`**.
- Notify the user (Slack if connected and authorized, otherwise the coordinator or chat) with the summary path, the
  branch and SHA, the test totals, and the "Unsure about" items.

## Then stop

- **Do not open a PR until the user approves**, and only when the target repo is confirmed ready.
- On approval: open the PR with `ManagePullRequest` (title `FED-xxx: <ticket title>`, body = the summary without the
  header, `skip_branch_prefix_check` only when the user asked for the Linear branch name). Confirm the PR's base repo
  is the intended one, then report the link. **Never merge**; the human reviewer merges.
- On feedback: hand every point, verbatim, to the reflect skill. Change no code until reflect has updated the skills.
