// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {ScheduledLeave, UserProfile} from '@mattermost/types/users';

export type UseScheduledLeaveResult = {
    active?: ScheduledLeave;
    upcoming?: ScheduledLeave;
};

export function useScheduledLeave(userId: UserProfile['id']): UseScheduledLeaveResult {
    return {};
}
