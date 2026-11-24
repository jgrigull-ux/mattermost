// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {GlobalState} from '@mattermost/types/store';
import type {ScheduledLeave, UserProfile} from '@mattermost/types/users';

import {
    getActiveScheduledLeave,
    getScheduledLeaveForUser,
    getUpcomingScheduledLeave,
    isUserOnScheduledLeave,
} from 'mattermost-redux/selectors/entities/users';

import TestHelper from '../../../test/test_helper';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 11, 1, 12);

const leave: ScheduledLeave = {
    start_at: NOW - DAY,
    end_at: NOW + (7 * DAY),
    timezone: 'America/Los_Angeles',
    backup_user_id: 'backupuserid',
    note: 'Family trip',
    auto_reply_enabled: false,
};

function stateWithProps(props?: Record<string, string>): GlobalState {
    const user = TestHelper.fakeUserWithId('user1');
    if (props) {
        user.props = props;
    } else {
        delete (user as Partial<UserProfile>).props;
    }
    return {
        entities: {
            users: {
                profiles: {
                    user1: user,
                },
            },
        },
    } as unknown as GlobalState;
}

function stateWithLeave(value: Partial<ScheduledLeave>): GlobalState {
    return stateWithProps({scheduledLeave: JSON.stringify({...leave, ...value})});
}

describe('scheduled leave selectors', () => {
    describe('getScheduledLeaveForUser', () => {
        test('returns undefined for an unknown user', () => {
            expect(getScheduledLeaveForUser(stateWithProps({}), 'missing')).toBeUndefined();
        });

        test.each([
            ['no props', undefined],
            ['no scheduledLeave key', {customStatus: '{}'}],
            ['an empty value', {scheduledLeave: ''}],
            ['invalid JSON', {scheduledLeave: '{not json'}],
            ['a non-object value', {scheduledLeave: '42'}],
            ['missing end_at', {scheduledLeave: JSON.stringify({start_at: NOW, auto_reply_enabled: false})}],
            ['end_at on start_at', {scheduledLeave: JSON.stringify({...leave, end_at: leave.start_at})}],
            ['non-numeric start_at', {scheduledLeave: JSON.stringify({...leave, start_at: '1'})}],
        ])('returns undefined for %s', (_, props) => {
            expect(getScheduledLeaveForUser(stateWithProps(props as Record<string, string> | undefined), 'user1')).toBeUndefined();
        });

        test('parses a valid leave', () => {
            expect(getScheduledLeaveForUser(stateWithLeave({}), 'user1')).toEqual(leave);
        });

        test('returns the same object for the same profile', () => {
            const state = stateWithLeave({});
            expect(getScheduledLeaveForUser(state, 'user1')).toBe(getScheduledLeaveForUser(state, 'user1'));
        });

        test('returns an expired leave, since activity is checked separately', () => {
            expect(getScheduledLeaveForUser(stateWithLeave({start_at: NOW - (10 * DAY), end_at: NOW - DAY}), 'user1')).toBeDefined();
        });
    });

    describe('getActiveScheduledLeave and isUserOnScheduledLeave', () => {
        const start = NOW;
        const end = NOW + DAY;
        const state = stateWithLeave({start_at: start, end_at: end});

        test.each([
            ['1 ms before start', start - 1, false],
            ['at start (inclusive)', start, true],
            ['during the leave', start + (DAY / 2), true],
            ['1 ms before end', end - 1, true],
            ['at end (exclusive)', end, false],
            ['after end', end + DAY, false],
        ])('%s', (_, now, active) => {
            expect(isUserOnScheduledLeave(state, 'user1', now)).toBe(active);
            if (active) {
                expect(getActiveScheduledLeave(state, 'user1', now)).toMatchObject({start_at: start, end_at: end});
            } else {
                expect(getActiveScheduledLeave(state, 'user1', now)).toBeUndefined();
            }
        });

        test('returns nothing for a user without leave', () => {
            expect(isUserOnScheduledLeave(stateWithProps({}), 'user1', NOW)).toBe(false);
            expect(getActiveScheduledLeave(stateWithProps({}), 'user1', NOW)).toBeUndefined();
        });
    });

    describe('getUpcomingScheduledLeave', () => {
        test.each([
            ['starts in 3 days', NOW + (3 * DAY), true],
            ['starts in exactly 7 days', NOW + (7 * DAY), true],
            ['starts in 7 days and 1 ms', NOW + (7 * DAY) + 1, false],
            ['starts in 1 ms', NOW + 1, true],
            ['already started (active)', NOW, false],
        ])('%s', (_, startAt, upcoming) => {
            const state = stateWithLeave({start_at: startAt, end_at: startAt + (3 * DAY)});
            if (upcoming) {
                expect(getUpcomingScheduledLeave(state, 'user1', NOW)).toMatchObject({start_at: startAt});
            } else {
                expect(getUpcomingScheduledLeave(state, 'user1', NOW)).toBeUndefined();
            }
        });

        test('returns nothing for an expired leave', () => {
            const state = stateWithLeave({start_at: NOW - (5 * DAY), end_at: NOW - DAY});
            expect(getUpcomingScheduledLeave(state, 'user1', NOW)).toBeUndefined();
            expect(isUserOnScheduledLeave(state, 'user1', NOW)).toBe(false);
        });
    });
});
