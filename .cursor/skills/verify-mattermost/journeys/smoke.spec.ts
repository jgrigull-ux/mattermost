// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

import {capture} from './evidence';

test('smoke: a fresh user logs in and lands on town-square', async ({pw}) => {
    const {user, team} = await pw.initSetup();

    const {channelsPage, page} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name, 'town-square');
    await channelsPage.toBeVisible();

    await expect(channelsPage.centerView.postCreate.input).toBeVisible();
    await expect(page.locator('#global-header')).toBeVisible();
    await capture(page, 'smoke-town-square.png');
});
