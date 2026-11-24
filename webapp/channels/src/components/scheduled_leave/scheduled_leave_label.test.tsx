// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import type {ScheduledLeave} from '@mattermost/types/users';
import type {DeepPartial} from '@mattermost/types/utilities';

import {getMissingProfilesByIds} from 'mattermost-redux/actions/users';

import {renderWithContext, screen} from 'tests/react_testing_utils';
import {TestHelper} from 'utils/test_helper';

import type {GlobalState} from 'types/store';

import ScheduledLeaveLabel from './scheduled_leave_label';

jest.mock('mattermost-redux/actions/users', () => ({
    ...jest.requireActual('mattermost-redux/actions/users'),
    getMissingProfilesByIds: jest.fn(() => ({type: 'MOCK_GET_MISSING_PROFILES'})),
}));

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 11, 1, 12);

// Tue, Dec 8 at noon in Los Angeles, which is already Wed, Dec 9 in Tokyo.
const END_AT = Date.UTC(2026, 11, 8, 20);

const leave: ScheduledLeave = {
    start_at: NOW - DAY,
    end_at: END_AT,
    backup_user_id: 'backup1',
    auto_reply_enabled: false,
};

function getState(timezone: string, backupOverrides: Record<string, unknown> = {}, includeBackup = true): DeepPartial<GlobalState> {
    const currentUser = TestHelper.getUserMock({
        id: 'current',
        timezone: {useAutomaticTimezone: 'false', manualTimezone: timezone, automaticTimezone: ''},
    });
    const backup = TestHelper.getUserMock({id: 'backup1', username: 'sam', delete_at: 0, ...backupOverrides});
    return {
        entities: {
            users: {
                currentUserId: currentUser.id,
                profiles: {
                    [currentUser.id]: currentUser,
                    ...(includeBackup ? {[backup.id]: backup} : {}),
                },
            },
        },
    };
}

describe('components/scheduled_leave/ScheduledLeaveLabel', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(NOW);
        (getMissingProfilesByIds as jest.Mock).mockClear();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('shows the return date in the viewer timezone', () => {
        renderWithContext(<ScheduledLeaveLabel leave={leave}/>, getState('America/Los_Angeles'));
        expect(screen.getByText('On leave until Tue, Dec 8')).toBeInTheDocument();
    });

    test('uses the viewer timezone, not the browser default', () => {
        renderWithContext(<ScheduledLeaveLabel leave={leave}/>, getState('Asia/Tokyo'));
        expect(screen.getByText('On leave until Wed, Dec 9')).toBeInTheDocument();
    });

    test('adds the year when the date is not in the current year', () => {
        const nextYear = {...leave, end_at: Date.UTC(2027, 0, 8, 20)};
        renderWithContext(<ScheduledLeaveLabel leave={nextYear}/>, getState('America/Los_Angeles'));
        expect(screen.getByText('On leave until Fri, Jan 8, 2027')).toBeInTheDocument();
    });

    test('shows the start date for upcoming leave', () => {
        const upcoming = {...leave, start_at: Date.UTC(2026, 11, 4, 17), end_at: END_AT};
        renderWithContext(
            <ScheduledLeaveLabel
                leave={upcoming}
                upcoming={true}
            />,
            getState('America/Los_Angeles'),
        );
        expect(screen.getByText('Away from Fri, Dec 4')).toBeInTheDocument();
    });

    test('shows the backup contact as an @mention button', () => {
        renderWithContext(<ScheduledLeaveLabel leave={leave}/>, getState('America/Los_Angeles'));
        expect(screen.getByText(/Backup:/)).toBeInTheDocument();
        expect(screen.getByRole('button', {name: /@sam/})).toBeInTheDocument();
    });

    test('hides the backup when showBackup is false', () => {
        renderWithContext(
            <ScheduledLeaveLabel
                leave={leave}
                showBackup={false}
            />,
            getState('America/Los_Angeles'),
        );
        expect(screen.getByText('On leave until Tue, Dec 8')).toBeInTheDocument();
        expect(screen.queryByText(/@sam/)).not.toBeInTheDocument();
    });

    test('hides a deactivated backup', () => {
        renderWithContext(<ScheduledLeaveLabel leave={leave}/>, getState('America/Los_Angeles', {delete_at: 1}));
        expect(screen.getByText('On leave until Tue, Dec 8')).toBeInTheDocument();
        expect(screen.queryByText(/Backup:/)).not.toBeInTheDocument();
    });

    test('fetches a backup profile that is not loaded and shows nothing for it meanwhile', () => {
        renderWithContext(<ScheduledLeaveLabel leave={leave}/>, getState('America/Los_Angeles', {}, false));
        expect(getMissingProfilesByIds).toHaveBeenCalledWith(['backup1']);
        expect(screen.getByText('On leave until Tue, Dec 8')).toBeInTheDocument();
        expect(screen.queryByText(/Backup:/)).not.toBeInTheDocument();
    });

    test('renders no backup line when none is set', () => {
        const noBackup = {...leave, backup_user_id: undefined};
        renderWithContext(<ScheduledLeaveLabel leave={noBackup}/>, getState('America/Los_Angeles'));
        expect(screen.queryByText(/Backup:/)).not.toBeInTheDocument();
        expect(getMissingProfilesByIds).not.toHaveBeenCalled();
    });
});
