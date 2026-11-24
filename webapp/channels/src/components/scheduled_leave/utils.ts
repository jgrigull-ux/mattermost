// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {ScheduledLeave, UserProfile} from '@mattermost/types/users';

export type ScheduledLeaveField = 'start' | 'end' | 'backup' | 'note' | 'message' | 'general';

export function parseScheduledLeave(user?: Pick<UserProfile, 'props'>): ScheduledLeave | undefined {
    return user ? undefined : undefined;
}

export function isScheduledLeaveEnded(leave: ScheduledLeave, now: number): boolean {
    return leave.end_at < now - 1;
}

export function getFieldForServerError(serverErrorId?: string): ScheduledLeaveField {
    return serverErrorId ? 'general' : 'general';
}
