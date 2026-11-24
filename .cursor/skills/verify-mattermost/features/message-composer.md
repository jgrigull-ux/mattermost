# Message composer

The message box at the bottom of every channel and thread lets the user write and send messages, insert line breaks, @mention people through autocomplete, format text, attach files, schedule a message, and keep an unsent draft per channel. In a DM it also warns when the other user is Out of office (and, separately, in Do not disturb or a distant timezone).

## Sub-features

- `compose-send-enter` sends the typed message with Enter.
- `compose-multiline` inserts a line break with Shift+Enter.
- `compose-mention` suggests channel members after `@` and inserts the chosen username.
- `compose-draft` keeps an unsent draft per channel across channel switches.
- `compose-dm-ooo-warning` shows `<user> is Out of Office.` above the box in a DM with an OOO user.
- `compose-schedule` schedules a message from the `Schedule message` button (not in the journey yet).

## How to get to it (user POV)

- Open any channel and click the box labeled `Write to <channel>`.
- Open a thread from a post's reply arrow to use the reply box in the right sidebar.
- Open a DM from the sidebar or from a profile popover's `Message` button.

## Driving it with verify-mattermost

Preconditions:

- `vm doctor` reports `HEALTHY`.
- A second user is a member of Town Square for the mention step (`adminClient.createUsers` then `adminClient.addToChannel`).

- **Send with Enter.** Type a message and press Enter. Use `composer.typeMessage(text)` then `composer.input.press('Enter')` with `composer = channelsPage.centerView.postCreate`. The box empties and `channelsPage.getLastPost()` contains the text.
- **Multi-line.** Type, press Shift+Enter, type more, send. Use `composer.input.press('Shift+Enter')` and `composer.sendMessage()`. The box held `line one\nline two` and the last post shows both lines.
- **Mention autocomplete.** Type `@` and part of a username. Use `composer.typeMessage('@mentione', {delay: 50})`. `getByRole('listbox', {name: 'Suggestions'})` shows an option with the username. Press Enter and the box reads `@<username> `.
- **Draft survives a switch.** Type without sending, go to another channel and back. Use `composer.writeMessage(draft)`, `channelsPage.goto(team.name, 'off-topic')`, then `channelsPage.goto(team.name, 'town-square')`. Off-Topic's box is empty and Town Square's box still holds the draft.
- **DM Out of office warning.** With `ExperimentalEnableAutomaticReplies` on and the DM partner's automatic replies on (see account menu), open the DM. `getByTestId('outOfOfficeWarning')` reads `<user> is Out of Office.` above the box. The `scheduled-leave-before` journey drives this path.
- **Side effects.** Read the channel back. `adminClient.getPosts(townSquare.id)` contains the sent messages exactly (`'line one\nline two'`) and does not contain the draft.
- **Proof.** Run `vm drive message-composer`. `composer-mention-autocomplete.png` and `composer-after-send.png` show the suggestion list and the sent posts with the restored draft.

## Gotchas

- Pressing Enter immediately after `writeMessage()` (Playwright `fill`) can leave the text unsent. Type with `typeMessage()` before pressing Enter, or use `sendMessage()` to click the send button.
- Autocomplete is debounced. Type with a per-key `delay` and wait for the listbox, not a fixed sleep.
- The OOO warning needs both the server setting `TeamSettings.ExperimentalEnableAutomaticReplies` and the partner's `auto_responder_active` notify prop. Neither is on by default, so without them the journey must report the precondition as missing, not pass.
- Drafts sync to the server and show under `Drafts` in the sidebar. A draft left behind by a journey is expected, not a leak.
- DM boxes also show `The time for <user> is <time>` when the partner's timezone differs. That line is hidden while the OOO warning shows.
