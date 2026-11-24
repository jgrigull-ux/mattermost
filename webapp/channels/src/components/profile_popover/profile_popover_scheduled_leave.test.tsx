// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import type {ScheduledLeave, UserProfile} from '@mattermost/types/users';
import type {DeepPartial} from '@mattermost/types/utilities';

import {UserTypes} from 'mattermost-redux/action_types';

import {act, renderWithContext, screen} from 'tests/react_testing_utils';
import {TestHelper} from 'utils/test_helper';

import type {GlobalState} from 'types/store';

import ProfilePopoverScheduledLeave from './profile_popover_scheduled_leave';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 11, 1, 12);

const activeLeave: ScheduledLeave = {
    start_at: NOW - DAY,
    end_at: Date.UTC(2026, 11, 8, 20),
    backup_user_id: 'backup1',
    note: 'Family trip',
    auto_reply_enabled: false,
};

function setup(leave?: Partial<ScheduledLeave> | null, haveOverrideProp = false) {
    const user = TestHelper.getUserMock({
        id: 'user1',
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
                    [user.id]: user,
                    [currentUser.id]: currentUser,
                    [backup.id]: backup,
                },
            },
        },
    };

    const result = renderWithContext(
        <ProfilePopoverScheduledLeave
            user={user}
            haveOverrideProp={haveOverrideProp}
        />,
        state,
    );
    return {...result, user};
}

describe('components/profile_popover/ProfilePopoverScheduledLeave', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(NOW);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('shows the return date, note and backup while leave is active', () => {
        setup({});
        expect(screen.getByText('On leave until Tue, Dec 8')).toBeInTheDocument();
        expect(screen.getByText('Family trip')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: /@sam/})).toBeInTheDocument();
    });

    test('shows "Away from" for leave starting within 7 days', () => {
        setup({start_at: Date.UTC(2026, 11, 4, 17), end_at: Date.UTC(2026, 11, 8, 20)});
        expect(screen.getByText('Away from Fri, Dec 4')).toBeInTheDocument();
        expect(screen.queryByText(/On leave until/)).not.toBeInTheDocument();
    });

    test('shows nothing for leave starting in more than 7 days', () => {
        const {container} = setup({start_at: NOW + (8 * DAY), end_at: NOW + (10 * DAY)});
        expect(container).toBeEmptyDOMElement();
    });

    test('shows nothing for expired leave', () => {
        const {container} = setup({start_at: NOW - (5 * DAY), end_at: NOW - DAY});
        expect(container).toBeEmptyDOMElement();
    });

    test('shows nothing for a user without leave', () => {
        const {container} = setup(null);
        expect(container).toBeEmptyDOMElement();
    });

    test('shows nothing when the popover name or icon is overridden', () => {
        const {container} = setup({}, true);
        expect(container).toBeEmptyDOMElement();
    });

    test('disappears when the leave is cleared in the store', () => {
        const {store, user} = setup({});
        expect(screen.getByText('On leave until Tue, Dec 8')).toBeInTheDocument();

        act(() => {
            store.dispatch({type: UserTypes.RECEIVED_PROFILE, data: {...user, props: {}} as UserProfile});
        });

        expect(screen.queryByText(/On leave until/)).not.toBeInTheDocument();
    });

    test('disappears when the leave ends, without a store change', () => {
        setup({end_at: NOW + HOUR});
        expect(screen.getByText(/On leave until/)).toBeInTheDocument();

        act(() => {
            jest.advanceTimersByTime(HOUR);
        });

        expect(screen.queryByText(/On leave until/)).not.toBeInTheDocument();
    });

    test('switches from "Away from" to "On leave until" when the leave starts', () => {
        setup({start_at: NOW + HOUR, end_at: NOW + (3 * DAY)});
        expect(screen.getByText(/Away from/)).toBeInTheDocument();

        act(() => {
            jest.advanceTimersByTime(HOUR);
        });

        expect(screen.getByText(/On leave until/)).toBeInTheDocument();
    });
});
