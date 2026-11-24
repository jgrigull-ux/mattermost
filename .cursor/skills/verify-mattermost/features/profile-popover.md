# Profile popover

Clicking another user's avatar or username opens a profile popover showing their picture with status, full name, @username, position, email, local time and, when set, custom status, plus a `Message` button that opens a direct message with them. This is where per-user availability text (for example "On leave until <date>") appears.

## Sub-features

- `popover-open-avatar` opens the popover from the avatar on a user's post.
- `popover-open-username` opens it from the username in a post header.
- `popover-fields` shows full name, @username, position, email, local time and status.
- `popover-message` opens or creates the DM with that user from `Message`.
- `popover-close` closes it with the close button or Escape.

## How to get to it (user POV)

- Click the avatar next to a user's post in any channel.
- Click the username in a post header.
- Click an @mention of the user in message text, or their avatar in the member list or a DM header.

## Driving it with verify-mattermost

Preconditions:

- `vm doctor` reports `HEALTHY`.
- A second user exists with `first_name`, `last_name` and `position` set (`adminClient.createUsers` then `adminClient.patchUser`) and has posted in a channel the viewer can read (`colleagueClient.createPost`).

- **Open from avatar.** Hover the colleague's post and click their avatar. Use `const popover = await channelsPage.openProfilePopover(await channelsPage.getLastPost())`. `getByTestId('user-profile-popover')` is visible.
- **Read fields.** Check the profile content. `getByTestId('popover-fullname-<username>')` reads `Avery Colleague`, `#userPopoverUsername` reads `@<username>`, the position text is visible, and `Local Time` is visible.
- **Close.** Choose the close button. Use `popover.close()` (`getByLabel('Close user profile popover')`). The popover is hidden.
- **Open from username.** Click the username in the post header. Use `post.container.getByRole('button', {name: username, exact: true}).click()`. The same popover appears.
- **Message the user.** Choose `Message`. Use `popover.message()`. The URL contains `/messages/@<username>` and `channelsPage.centerView.header.toHaveTitle(username)` passes.
- **Proof.** Run `vm drive profile-popover`. `profile-popover-from-avatar.png`, `profile-popover-from-username.png` and `profile-popover-message-dm.png` show the popover from both entry points and the resulting DM.

## Gotchas

- The popover for your own avatar is different: it shows `Edit Profile` and `Send yourself a message` instead of `Message`. Use a second user for the other-user layout.
- Local time shows `(UTC)` and an offset because seeded users have no timezone set. Set `timezone` on the user if the date or time text matters.
- The status dot reflects the colleague's live presence. API-created posts mark them online for a few minutes, then they show offline.
- `getLastPost()` returns the newest post, so make the colleague's post the last one before opening the popover.
