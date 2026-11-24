// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';
import type {Client4} from '@mattermost/client';
import type {ScheduledLeave} from '@mattermost/types/users';

async function getStoredLeave(adminClient: Client4, userId: string): Promise<ScheduledLeave | undefined> {
    const user = await adminClient.getUser(userId);
    return user.props?.scheduledLeave ? JSON.parse(user.props.scheduledLeave) : undefined;
}

test('schedules, edits and ends leave from the account menu', async ({pw}) => {
    const {user, team, adminClient} = await pw.initSetup();
    const [backup] = await adminClient.createUsers(team.id, 1, 'backup');

    // # Log in and open the account menu
    const {channelsPage, page} = await pw.testBrowser.login(user);
    await channelsPage.goto();
    await channelsPage.toBeVisible();
    let menu = await channelsPage.openUserAccountMenu();

    // # Choose "Schedule leave"
    await menu.container.getByRole('menuitem', {name: 'Schedule leave'}).click();
    let dialog = page.getByRole('dialog', {name: 'Schedule leave'});
    await expect(dialog).toBeVisible();

    // # Pick a backup contact, write a note and turn on the automatic reply
    await dialog.getByLabel('Backup contact').fill(backup.username);
    await page.locator('#suggestionList').getByText(`@${backup.username}`).click();
    await expect(dialog.getByLabel('Backup contact')).toHaveValue(`@${backup.username}`);
    await dialog.getByLabel('Note').fill('Family trip');
    await dialog.getByText('Send an automatic reply', {exact: true}).click();
    await expect(dialog.getByRole('switch', {name: 'Send an automatic reply'})).toBeChecked();
    await dialog.getByLabel('Automatic reply message').fill('Back next week');
    await dialog.getByRole('button', {name: 'Save'}).click();
    await expect(dialog).toBeHidden();

    // * Verify the leave is stored with the auto-reply settings
    const created = await getStoredLeave(adminClient, user.id);
    expect(created).toMatchObject({
        backup_user_id: backup.id,
        note: 'Family trip',
        auto_reply_enabled: true,
        auto_reply_message: 'Back next week',
    });
    expect(created!.end_at).toBeGreaterThan(created!.start_at);

    // # Reload, then open the leave from the account menu
    await page.reload();
    await channelsPage.toBeVisible();
    menu = await channelsPage.openUserAccountMenu();
    const leaveItem = menu.container.getByRole('menuitem', {name: /On leave until/});
    await expect(leaveItem).toBeVisible();
    await leaveItem.hover();
    await page.getByRole('menuitem', {name: 'Edit leave'}).click();

    // * Verify the saved values are filled in
    dialog = page.getByRole('dialog', {name: 'Edit leave'});
    await expect(dialog.getByLabel('Note')).toHaveValue('Family trip');
    await expect(dialog.getByLabel('Automatic reply message')).toHaveValue('Back next week');

    // # Make yourself the backup contact, which the server rejects
    await dialog.getByLabel('Backup contact').fill(user.username);
    await page.locator('#suggestionList').getByText(`@${user.username}`).click();
    await dialog.getByRole('button', {name: 'Save'}).click();

    // * Verify the error is shown next to the backup contact and nothing changed
    const backupInput = dialog.getByLabel('Backup contact');
    await expect(backupInput).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog.getByRole('alert')).toHaveText('You can\'t be your own backup contact.');
    expect((await getStoredLeave(adminClient, user.id))?.backup_user_id).toBe(backup.id);

    // # Remove the backup, change the note and turn the automatic reply off
    await backupInput.fill('');
    await dialog.getByLabel('Note').fill('Family trip, extended');
    await dialog.getByText('Send an automatic reply', {exact: true}).click();
    await expect(dialog.getByRole('switch', {name: 'Send an automatic reply'})).not.toBeChecked();
    await dialog.getByRole('button', {name: 'Save'}).click();
    await expect(dialog).toBeHidden();

    // * Verify the edit is stored
    const edited = await getStoredLeave(adminClient, user.id);
    expect(edited).toMatchObject({note: 'Family trip, extended', auto_reply_enabled: false});
    expect(edited).not.toHaveProperty('backup_user_id');
    expect(edited).not.toHaveProperty('auto_reply_message');

    // # End the leave now
    menu = await channelsPage.openUserAccountMenu();
    await menu.container.getByRole('menuitem', {name: /On leave until/}).hover();
    await page.getByRole('menuitem', {name: 'End leave now'}).click();

    // * Verify the leave is gone, also after a reload
    await expect.poll(() => getStoredLeave(adminClient, user.id)).toBeUndefined();
    await page.reload();
    await channelsPage.toBeVisible();
    menu = await channelsPage.openUserAccountMenu();
    await expect(menu.container.getByRole('menuitem', {name: 'Schedule leave'})).toBeVisible();
    await expect(menu.container.getByRole('menuitem', {name: /On leave until/})).toHaveCount(0);
});
