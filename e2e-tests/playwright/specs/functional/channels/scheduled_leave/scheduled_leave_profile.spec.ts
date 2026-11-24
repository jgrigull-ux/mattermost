// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

const DAY = 24 * 60 * 60 * 1000;

/**
 * @objective Verify that an active scheduled leave shows in the DM channel header and the profile popover,
 * and disappears without a reload when it is cleared.
 */
test('shows "On leave until" in the DM header and profile popover and clears live @scheduled_leave', async ({pw}) => {
    const {user, adminClient, team} = await pw.initSetup();

    const onLeaveUser = await adminClient.createUser(await pw.random.user('leave'), '', '');
    await adminClient.addToTeam(team.id, onLeaveUser.id);
    const backupUser = await adminClient.createUser(await pw.random.user('backup'), '', '');
    await adminClient.addToTeam(team.id, backupUser.id);

    const dmChannel = await adminClient.createDirectChannel([user.id, onLeaveUser.id]);
    const {client: onLeaveClient} = await pw.makeClient(onLeaveUser);
    await onLeaveClient.createPost({channel_id: dmChannel.id, message: 'Heading out tomorrow'});

    // # Set an active leave for the other user
    const now = Date.now();
    await adminClient.setScheduledLeave(onLeaveUser.id, {
        start_at: now - DAY,
        end_at: now + (5 * DAY),
        backup_user_id: backupUser.id,
        note: 'Family trip',
        auto_reply_enabled: false,
    });

    // # Open the DM as the viewer
    const {channelsPage} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name, `@${onLeaveUser.username}`);
    await channelsPage.toBeVisible();

    // * The DM header shows the leave chip with the backup
    const chip = channelsPage.centerView.header.container.getByTestId('channel-header-scheduled-leave');
    await expect(chip).toContainText('On leave until');
    await expect(chip).toContainText(`@${backupUser.username}`);

    // # Open the profile popover of the user on leave
    const post = await channelsPage.getLastPost();
    const popover = await channelsPage.openProfilePopover(post);

    // * The popover shows the label, note and backup
    await expect(popover.container.getByText(/On leave until/)).toBeVisible();
    await expect(popover.container.getByText('Family trip')).toBeVisible();
    await expect(popover.container.getByText(`@${backupUser.username}`)).toBeVisible();

    // # Clear the leave while the popover is open
    await adminClient.clearScheduledLeave(onLeaveUser.id);

    // * Both go away without a reload, driven by the user_updated websocket event
    await expect(popover.container.getByText(/On leave until/)).toHaveCount(0);
    await expect(chip).toHaveCount(0);
});
