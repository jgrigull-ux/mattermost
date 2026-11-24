// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useEffect, useReducer} from 'react';
import {useSelector} from 'react-redux';

import type {ScheduledLeave, UserProfile} from '@mattermost/types/users';

import {getScheduledLeaveForUser} from 'mattermost-redux/selectors/entities/users';
import {
    isScheduledLeaveActive,
    isScheduledLeaveUpcoming,
    SCHEDULED_LEAVE_UPCOMING_WINDOW,
} from 'mattermost-redux/utils/user_utils';

import type {GlobalState} from 'types/store';

// setTimeout overflows above 2^31 - 1 ms (about 24.8 days); longer waits are split into several timers.
const MAX_TIMEOUT = 2147483647;

export type UseScheduledLeaveResult = {
    active?: ScheduledLeave;
    upcoming?: ScheduledLeave;
};

/**
 * Returns the user's scheduled leave when it is active or starts within 7 days, and re-renders at each boundary
 * (entering the upcoming window, start, end). Nothing updates the profile when a leave starts or ends, so the
 * store alone cannot drive those changes.
 */
export function useScheduledLeave(userId: UserProfile['id']): UseScheduledLeaveResult {
    const leave = useSelector((state: GlobalState) => getScheduledLeaveForUser(state, userId));
    const [tick, forceUpdate] = useReducer((x: number) => x + 1, 0);

    useEffect(() => {
        if (!leave) {
            return undefined;
        }

        const now = Date.now();
        const next = [leave.start_at - SCHEDULED_LEAVE_UPCOMING_WINDOW, leave.start_at, leave.end_at].find((boundary) => boundary > now);
        if (next === undefined) {
            return undefined;
        }

        const timeout = setTimeout(forceUpdate, Math.min(next - now, MAX_TIMEOUT));
        return () => clearTimeout(timeout);
    }, [leave, tick]);

    const now = Date.now();
    return {
        active: isScheduledLeaveActive(leave, now) ? leave : undefined,
        upcoming: isScheduledLeaveUpcoming(leave, now) ? leave : undefined,
    };
}
