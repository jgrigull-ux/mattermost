// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

import {capture} from './evidence';

test('profile popover: open from avatar and from username, read profile fields, message the user', async ({pw}) => {
    const {user, team, adminClient} = await pw.initSetup();
    const [colleague] = await adminClient.createUsers(team.id, 1, 'colleague');
    await adminClient.patchUser({id: colleague.id, first_name: 'Avery', last_name: 'Colleague', position: 'Support lead'});
    const townSquare = await adminClient.getChannelByName(team.id, 'town-square');
    const {client: colleagueClient} = await pw.makeClient(colleague);
    await colleagueClient.createPost({channel_id: townSquare.id, message: `standup notes ${pw.random.id()}`});

    const {channelsPage, page} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name, 'town-square');
    await channelsPage.toBeVisible();

    const post = await channelsPage.getLastPost();
    await post.toContainText('standup notes');

    const popover = await channelsPage.openProfilePopover(post);
    await expect(popover.container.getByTestId(`popover-fullname-${colleague.username}`)).toHaveText('Avery Colleague');
    await expect(popover.container.locator('#userPopoverUsername')).toHaveText(`@${colleague.username}`);
    await expect(popover.container.getByText('Support lead')).toBeVisible();
    await expect(popover.container.getByText(/Local Time/)).toBeVisible();
    await expect(popover.messageButton).toBeVisible();
    await capture(page, 'profile-popover-from-avatar.png');
    await popover.close();
    await expect(popover.container).toBeHidden();

    await post.container.getByRole('button', {name: colleague.username, exact: true}).click();
    await expect(popover.container).toBeVisible();
    await expect(popover.container.locator('#userPopoverUsername')).toHaveText(`@${colleague.username}`);
    await capture(page, 'profile-popover-from-username.png');

    await popover.message();
    await expect.poll(() => page.url()).toContain(`/messages/@${colleague.username}`);
    await channelsPage.centerView.header.toHaveTitle(colleague.username);
    await capture(page, 'profile-popover-message-dm.png');
});
