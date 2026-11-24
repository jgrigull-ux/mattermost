// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Baseline captures of every surface the scheduled-leave tickets change: profile popover,
// DM channel header, account menu (with and without Out of office) and the composer's OOO warning.
import {expect, test} from '@mattermost/playwright-lib';

import {capture} from './evidence';

test('scheduled-leave baseline: popover, DM header, account menu, composer OOO warning', async ({pw}) => {
    const {user, team, adminClient} = await pw.initSetup();

    // Out of office (automatic replies) and its composer warning are off unless an admin enables them
    await adminClient.patchConfig({TeamSettings: {ExperimentalEnableAutomaticReplies: true}});

    const [colleague] = await adminClient.createUsers(team.id, 1, 'colleague');
    await adminClient.patchUser({id: colleague.id, first_name: 'Avery', last_name: 'Colleague', position: 'Support lead'});
    const {client: colleagueClient} = await pw.makeClient(colleague);
    const {client: userClient} = await pw.makeClient(user);

    const dm = await adminClient.createDirectChannel([user.id, colleague.id]);
    await userClient.createPost({channel_id: dm.id, message: 'Hi Avery, are you around next week?'});
    await colleagueClient.createPost({channel_id: dm.id, message: 'Yes, all week. Ping me any time.'});

    const {channelsPage, page} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name, `@${colleague.username}`);
    await channelsPage.toBeVisible();
    await channelsPage.centerView.header.toHaveTitle(colleague.username);

    // DM channel header with the colleague
    await capture(page, 'dm-channel-header.png');

    // Another user's profile popover, opened from their avatar on their post
    const post = await channelsPage.getLastPost();
    await post.toContainText('Yes, all week');
    const popover = await channelsPage.openProfilePopover(post);
    await expect(popover.container.locator('#userPopoverUsername')).toContainText(colleague.username);
    await capture(page, 'profile-popover.png');
    await popover.close();
    await expect(popover.container).toBeHidden();

    // Own account menu with the current status options
    const menu = await channelsPage.openUserAccountMenu();
    await expect(menu.online).toBeVisible();
    await expect(menu.dnd).toBeVisible();
    await capture(page, 'account-menu.png');
    await page.keyboard.press('Escape');
    await expect(menu.container).toBeHidden();

    // Colleague turns on automatic replies, which sets their status to Out of office
    await colleagueClient.patchMe({
        notify_props: {...colleague.notify_props, auto_responder_active: 'true', auto_responder_message: 'Out until Monday.'},
    });
    await expect.poll(async () => (await adminClient.getStatus(colleague.id)).status).toBe('ooo');

    await page.reload();
    await channelsPage.toBeVisible();
    const warning = page.getByTestId('outOfOfficeWarning');
    await expect(warning).toBeVisible();
    await expect(warning).toContainText('is Out of Office.');
    await channelsPage.centerView.postCreate.writeMessage('Quick question about the release');
    await capture(page, 'composer-ooo-warning.png');

    // The account menu only lists "Out of office" while the viewer is OOO themselves
    await userClient.patchMe({
        notify_props: {...user.notify_props, auto_responder_active: 'true', auto_responder_message: 'Away today.'},
    });
    await expect.poll(async () => (await adminClient.getStatus(user.id)).status).toBe('ooo');
    await page.reload();
    await channelsPage.toBeVisible();
    const stayOoo = page.getByRole('button', {name: 'Stay "Out of office"'});
    if (await stayOoo.isVisible({timeout: 5000}).catch(() => false)) {
        await stayOoo.click();
    }
    const oooMenu = await channelsPage.openUserAccountMenu();
    await expect(oooMenu.container.getByText('Out of office', {exact: true})).toBeVisible();
    await capture(page, 'account-menu-ooo.png');
});
