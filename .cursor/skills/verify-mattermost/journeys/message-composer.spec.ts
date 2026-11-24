// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

import {capture} from './evidence';

test('message composer: send with Enter, multi-line, @mention autocomplete, draft survives a channel switch', async ({
    pw,
}) => {
    const {user, team, adminClient} = await pw.initSetup();
    const [colleague] = await adminClient.createUsers(team.id, 1, 'mentionee');
    const townSquare = await adminClient.getChannelByName(team.id, 'town-square');
    await adminClient.addToChannel(colleague.id, townSquare.id);

    const {channelsPage, page} = await pw.testBrowser.login(user);
    await channelsPage.goto(team.name, 'town-square');
    await channelsPage.toBeVisible();
    const composer = channelsPage.centerView.postCreate;

    const first = `composer check ${pw.random.id()}`;
    await composer.typeMessage(first);
    await composer.input.press('Enter');
    await expect(composer.input).toHaveValue('');
    await (await channelsPage.getLastPost()).toContainText(first);

    await composer.input.pressSequentially('line one');
    await composer.input.press('Shift+Enter');
    await composer.input.pressSequentially('line two');
    await expect(composer.input).toHaveValue('line one\nline two');
    await composer.sendMessage();
    const multiline = await channelsPage.getLastPost();
    await multiline.toContainText('line one');
    await multiline.toContainText('line two');

    await composer.typeMessage(`@${colleague.username.slice(0, 8)}`, {delay: 50});
    await expect(composer.suggestionList).toBeVisible();
    await expect(composer.suggestionOptions.filter({hasText: colleague.username})).toBeVisible();
    await capture(page, 'composer-mention-autocomplete.png');
    await composer.input.press('Enter');
    await expect(composer.input).toHaveValue(`@${colleague.username} `);
    await composer.input.pressSequentially('please review');
    await composer.input.press('Enter');
    await (await channelsPage.getLastPost()).toContainText(`@${colleague.username} please review`);

    const draft = `unsent draft ${pw.random.id()}`;
    await composer.writeMessage(draft);
    await channelsPage.goto(team.name, 'off-topic');
    await channelsPage.toBeVisible();
    await expect(composer.input).toHaveValue('');
    await channelsPage.goto(team.name, 'town-square');
    await channelsPage.toBeVisible();
    await expect(composer.input).toHaveValue(draft);
    await capture(page, 'composer-after-send.png');

    const posts = await adminClient.getPosts(townSquare.id);
    const messages = Object.values(posts.posts).map((p) => p.message);
    expect(messages).toContain(first);
    expect(messages).toContain('line one\nline two');
    expect(messages).toContain(`@${colleague.username} please review`);
    expect(messages).not.toContain(draft);
});
