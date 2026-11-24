// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {FormattedMessage} from 'react-intl';

import type {UserProfile} from '@mattermost/types/users';

import ScheduledLeaveLabel from 'components/scheduled_leave/scheduled_leave_label';
import {useScheduledLeave} from 'components/scheduled_leave/use_scheduled_leave';

type Props = {
    user: UserProfile;
    haveOverrideProp: boolean;
};

const ProfilePopoverScheduledLeave = ({user, haveOverrideProp}: Props) => {
    const {active, upcoming} = useScheduledLeave(user.id);
    const leave = active ?? upcoming;

    if (haveOverrideProp || !leave) {
        return null;
    }

    return (
        <div
            id='user-popover-scheduled-leave'
            className='user-popover__time-status-container user-popover__scheduled-leave'
            aria-labelledby='user-popover__scheduled-leave-title'
        >
            <strong
                id='user-popover__scheduled-leave-title'
                className='user-popover__subtitle'
            >
                <FormattedMessage
                    id='user_profile.scheduled_leave'
                    defaultMessage='Leave'
                    description='Heading of the scheduled leave row in the profile popover; "Leave" is a noun (time off).'
                />
            </strong>
            <ScheduledLeaveLabel
                leave={leave}
                upcoming={!active}
            />
            {leave.note && (
                <p className='user-popover__scheduled-leave-note'>
                    {leave.note}
                </p>
            )}
        </div>
    );
};

export default ProfilePopoverScheduledLeave;
