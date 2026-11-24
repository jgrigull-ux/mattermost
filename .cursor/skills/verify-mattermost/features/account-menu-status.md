# Account menu and status

The avatar button at the right of the global header opens the account menu. From it the user sets a custom status, switches presence between Online, Away, Do not disturb (with an expiry) and Offline, turns off Out of office when automatic replies are on, opens their profile, and logs out. The current status is announced on the button and shown as a dot on the avatar.

## Sub-features

- `menu-open` opens the menu, which shows the user's name and @username.
- `status-away` sets Away.
- `status-dnd` sets Do not disturb with an expiry from the submenu (Don't clear, 30 mins, 1 hour, 2 hours, Tomorrow, Choose date and time).
- `status-online` returns to Online.
- `status-offline` sets Offline.
- `status-ooo` shows the `Out of office` item while automatic replies are on.
- `custom-status` sets a custom status text and emoji with an expiry.
- `menu-profile` opens the Profile dialog. `menu-logout` signs out.

## How to get to it (user POV)

- Click your avatar at the top right (`User's account menu`).
- Custom status can also be set from the smiley next to the avatar once one exists, and from your own profile popover (`Set a status`).
- Out of office is turned on in Settings > Notifications > Automatic replies, which an admin must enable first.

## Driving it with verify-mattermost

Preconditions:

- `vm doctor` reports `HEALTHY`.
- The viewer is a fresh `pw.initSetup()` user, starting Online.

- **Open menu.** Click the avatar button. Use `const menu = await channelsPage.openUserAccountMenu()`. `#userAccountMenu` is visible and contains `@<username>`.
- **Set Away.** Choose `Away`. Use `menu.away.click()`. `#userAccountMenuButtonDescribedBy` reads `Status is "Away".` and `adminClient.getStatus(user.id)` returns `status: 'away'`.
- **Set Do not disturb for 30 minutes.** Reopen the menu, hover `Do not disturb`, choose `30 mins`. Use `menu.dnd.hover()` then `page.locator('[id="userAccountMenu.dndSubMenuItem.30Minutes"]').click()`. The button reads `Status is "Do not disturb".`, the menu item reads `Until <time>`, and the API returns `status: 'dnd'` with `dnd_end_time > 0`.
- **Set custom status.** Reopen the menu and choose `Set custom status`. Use `menu.container.getByRole('menuitem', {name: 'Set custom status'}).click()`, fill `getByRole('dialog', {name: 'Set a status'}).getByPlaceholder('Set a status')`, then choose `Set Status`. The menu shows the text with `(Until Tomorrow ...)` and `JSON.parse(adminClient.getUser(user.id).props.customStatus).text` matches.
- **Back to Online.** Choose `Online`. Use `menu.online.click()`. The button reads `Status is "Online".` and the API returns `status: 'online'`.
- **Out of office.** Enable automatic replies for the server with `adminClient.patchConfig({TeamSettings: {ExperimentalEnableAutomaticReplies: true}})`, then turn them on for the user with `userClient.patchMe({notify_props: {...user.notify_props, auto_responder_active: 'true', auto_responder_message: '...'}})` and reload. On reload a dialog offers `Stay "Out of office"`. Choosing it leaves the menu showing `Out of office / Automatic replies are enabled` above the presence options, and the API returns `status: 'ooo'`. The `scheduled-leave-before` journey drives this path.
- **Proof.** Run `vm drive account-menu-status`. `account-menu-open.png`, `account-menu-dnd-submenu.png` and `account-menu-custom-status.png` show the menu, the DND expiry submenu, and the menu with the custom status and DND set.

## Gotchas

- The repo page object `UserAccountMenu.setCustomStatus` looks for a `button`, but the item renders as a `menuitem`. Use `getByRole('menuitem', {name: 'Set custom status'})`.
- The menu fades in. Screenshots taken right after `toBeVisible()` come out half transparent, so use `capture()`.
- Hover `Do not disturb` to open its submenu. Clicking the item itself does not open it.
- Choosing a presence status while Out of office first asks whether to disable automatic replies (`Set status to "..."` or `Stay "Out of office"`). Account for that dialog in any journey that starts OOO.
- `Out of office` appears in the menu only while the user is OOO, and only when `ExperimentalEnableAutomaticReplies` is on. It is not a status the user can pick from the menu.
- Custom status defaults to expiring "Today", shown as `Until Tomorrow at 12:00 AM`. Assert on the text, not the expiry label.
