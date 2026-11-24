# Sign in and channel view

A user signs in with username or email and password and lands in a team's channel view: the left sidebar with channels and direct messages, the center channel with its header, post list and message box, and the global header with search and the account menu.

## Sub-features

- `signin-password` signs in from the login page with username and password.
- `signin-landing` lands on a team channel (Town Square) with the composer ready.
- `channel-switch` moves between channels from the left sidebar or the URL.

## How to get to it (user POV)

- Open `http://localhost:8065/login` and submit the login form.
- Open a deep link such as `http://localhost:8065/<team>/channels/town-square`; signed-out users are sent to login first.
- Choose a channel such as `Off-Topic` in the left sidebar.

## Driving it with verify-mattermost

Preconditions:

- `vm doctor` reports `HEALTHY`.
- The journey's `pw.initSetup()` user is a member of its team, which has `town-square` and `off-topic`.

- **Sign in.** Log in through the real login page. Use `const {channelsPage, page} = await pw.testBrowser.login(user)`. The browser is authenticated as `user`.
- **Land on Town Square.** Go to the team's default channel. Use `channelsPage.goto(team.name, 'town-square')` and `channelsPage.toBeVisible()`. `getByTestId('channel_view')` is visible and the URL ends in `/<team>/channels/town-square`.
- **Composer ready.** Check the message box. `channelsPage.centerView.postCreate.input` (`data-testid="post_textbox"`, placeholder `Write to Town Square`) is visible.
- **Global header.** Check the header. `#global-header` is visible and contains `getByRole('button', {name: "User's account menu"})`.
- **Switch channel.** Choose another channel. Use `channelsPage.goto(team.name, 'off-topic')` or click `Off-Topic` in `#SidebarContainer`. The header title reads `Off-Topic`.
- **Proof.** Run `vm drive smoke`. `playwright.log` shows `1 passed` and `smoke-town-square.png` shows Town Square with the composer.

## Gotchas

- `launch` already runs this journey to prove the instance is usable. A failure here means the instance is broken, not the feature: check `vm doctor` and `/tmp/verify-mattermost/server.log`.
- Users from `pw.initSetup()` and `adminClient.createUsers()` land without onboarding tours in these journeys. Users created another way (signup page, mmctl) may see tours that cover the channel view.
- Display names default to usernames (`TeammateNameDisplay` = username), so assert on usernames in headers and posts.
- Team Edition shows `TEAM EDITION` next to the logo. Enterprise-only menus and settings are absent there.
