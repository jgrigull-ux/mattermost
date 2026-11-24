// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

import {capture} from './evidence';

test('account menu: open it, change status (Away, Do not disturb 30 mins, Online) and set a custom status', async ({
    pw,
}) => {
    const {user, team, adminClient} = await pw.initSetup();
    const {channelsPage, page} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name, 'town-square');
    await channelsPage.toBeVisible();

    const statusDescription = page.locator('#userAccountMenuButtonDescribedBy');
    await expect(statusDescription).toHaveText('Status is "Online".');

    const menu = await channelsPage.openUserAccountMenu();
    await expect(menu.container.getByText(`@${user.username}`)).toBeVisible();
    await capture(page, 'account-menu-open.png');

    await menu.away.click();
    await expect(menu.container).toBeHidden();
    await expect(statusDescription).toHaveText('Status is "Away".');
    await expect.poll(async () => (await adminClient.getStatus(user.id)).status).toBe('away');

    await channelsPage.openUserAccountMenu();
    await menu.dnd.hover();
    const thirtyMinutes = page.locator('[id="userAccountMenu.dndSubMenuItem.30Minutes"]');
    await expect(thirtyMinutes).toBeVisible();
    await capture(page, 'account-menu-dnd-submenu.png');
    await thirtyMinutes.click();
    await expect(statusDescription).toHaveText('Status is "Do not disturb".');
    await expect.poll(async () => (await adminClient.getStatus(user.id)).status).toBe('dnd');
    expect((await adminClient.getStatus(user.id)).dnd_end_time).toBeGreaterThan(0);

    await channelsPage.openUserAccountMenu();
    await menu.container.getByRole('menuitem', {name: 'Set custom status'}).click();
    const statusModal = page.getByRole('dialog', {name: 'Set a status'});
    await expect(statusModal).toBeVisible();
    await statusModal.getByPlaceholder('Set a status').fill('Planning the sprint');
    await statusModal.getByRole('button', {name: 'Set Status'}).click();
    await expect(statusModal).toBeHidden();
    await expect
        .poll(async () => JSON.parse((await adminClient.getUser(user.id)).props?.customStatus || '{}').text)
        .toBe('Planning the sprint');

    await channelsPage.openUserAccountMenu();
    await expect(menu.container.getByText('Planning the sprint')).toBeVisible();
    await capture(page, 'account-menu-custom-status.png');

    await menu.online.click();
    await expect(statusDescription).toHaveText('Status is "Online".');
    await expect.poll(async () => (await adminClient.getStatus(user.id)).status).toBe('online');
});
