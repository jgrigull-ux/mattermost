// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import type {ScheduledLeave} from '@mattermost/types/users';
import type {DeepPartial} from '@mattermost/types/utilities';

import {renderWithContext, screen} from 'tests/react_testing_utils';
import {TestHelper} from 'utils/test_helper';

import type {GlobalState} from 'types/store';

import ChannelHeaderScheduledLeave from './channel_header_scheduled_leave';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 11, 1, 12);

const activeLeave: ScheduledLeave = {
    start_at: NOW - DAY,
    end_at: Date.UTC(2026, 11, 8, 20),
    backup_user_id: 'backup1',
    note: 'Family trip',
    auto_reply_enabled: false,
};

function setup(leave?: Partial<ScheduledLeave>) {
    const dmUser = TestHelper.getUserMock({
        id: 'user1',
        username: 'alex',
        props: leave ? {scheduledLeave: JSON.stringify({...activeLeave, ...leave})} : {},
    });
    const currentUser = TestHelper.getUserMock({
        id: 'current',
        timezone: {useAutomaticTimezone: 'false', manualTimezone: 'America/Los_Angeles', automaticTimezone: ''},
    });
    const backup = TestHelper.getUserMock({id: 'backup1', username: 'sam', delete_at: 0});
    const state: DeepPartial<GlobalState> = {
        entities: {
            users: {
                currentUserId: currentUser.id,
                profiles: {
                    [dmUser.id]: dmUser,
                    [currentUser.id]: currentUser,
                    [backup.id]: backup,
                },
            },
        },
    };
    return renderWithContext(<ChannelHeaderScheduledLeave dmUser={dmUser}/>, state);
}

describe('components/channel_header/ChannelHeaderScheduledLeave', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(NOW);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('shows a chip with the return date and backup while leave is active', () => {
        setup({});
        expect(screen.getByTestId('channel-header-scheduled-leave')).toBeInTheDocument();
        expect(screen.getByText('On leave until Tue, Dec 8')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: /@sam/})).toBeInTheDocument();
    });

    test('does not show the note', () => {
        setup({});
        expect(screen.queryByText('Family trip')).not.toBeInTheDocument();
    });

    test('shows nothing for upcoming leave', () => {
        const {container} = setup({start_at: NOW + DAY, end_at: NOW + (3 * DAY)});
        expect(container).toBeEmptyDOMElement();
    });

    test('shows nothing for expired leave', () => {
        const {container} = setup({start_at: NOW - (3 * DAY), end_at: NOW - DAY});
        expect(container).toBeEmptyDOMElement();
    });

    test('shows nothing without leave', () => {
        const {container} = setup();
        expect(container).toBeEmptyDOMElement();
    });
});
