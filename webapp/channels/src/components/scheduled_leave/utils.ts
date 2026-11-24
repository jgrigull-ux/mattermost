// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {ScheduledLeave, UserProfile} from '@mattermost/types/users';

export type ScheduledLeaveField = 'start' | 'end' | 'backup' | 'note' | 'message' | 'general';

const fieldsByServerErrorId: Record<string, ScheduledLeaveField> = {
    'model.scheduled_leave.is_valid.start_at.app_error': 'start',
    'model.scheduled_leave.is_valid.end_at.app_error': 'end',
    'model.scheduled_leave.is_valid.duration.app_error': 'end',
    'app.scheduled_leave.set.end_in_past.app_error': 'end',
    'model.scheduled_leave.is_valid.backup_user_id.app_error': 'backup',
    'app.scheduled_leave.set.backup_self.app_error': 'backup',
    'app.scheduled_leave.set.backup_invalid.app_error': 'backup',
    'model.scheduled_leave.is_valid.note.app_error': 'note',
    'model.scheduled_leave.is_valid.auto_reply_message.app_error': 'message',
};

// A missing key, an empty string and unparsable JSON all mean "no leave".
export function parseScheduledLeave(user?: Pick<UserProfile, 'props'>): ScheduledLeave | undefined {
    const raw = user?.props?.scheduledLeave;
    if (!raw) {
        return undefined;
    }

    try {
        const leave = JSON.parse(raw);
        if (typeof leave?.start_at !== 'number' || typeof leave?.end_at !== 'number') {
            return undefined;
        }
        return leave;
    } catch {
        return undefined;
    }
}

// The end is exclusive: the user is back at end_at.
export function isScheduledLeaveEnded(leave: ScheduledLeave, now: number): boolean {
    return now >= leave.end_at;
}

export function getFieldForServerError(serverErrorId?: string): ScheduledLeaveField {
    return (serverErrorId && fieldsByServerErrorId[serverErrorId]) || 'general';
}
