// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import {CalendarOutlineIcon} from '@mattermost/compass-icons/components';
import type {UserProfile} from '@mattermost/types/users';

import ScheduledLeaveLabel from 'components/scheduled_leave/scheduled_leave_label';
import {useScheduledLeave} from 'components/scheduled_leave/use_scheduled_leave';

import './channel_header_scheduled_leave.scss';

type Props = {
    dmUser?: UserProfile;
};

/**
 * Compact chip next to the teammate's name in a DM header while they are on leave. It sits outside the channel menu
 * button because the backup @mention inside it is itself a button.
 */
const ChannelHeaderScheduledLeave = ({dmUser}: Props) => {
    const {active} = useScheduledLeave(dmUser?.id ?? '');

    if (!dmUser || !active) {
        return null;
    }

    return (
        <div
            className='channel-header__scheduled-leave'
            data-testid='channel-header-scheduled-leave'
        >
            <CalendarOutlineIcon
                size={14}
                aria-hidden={true}
            />
            <ScheduledLeaveLabel leave={active}/>
        </div>
    );
};

export default ChannelHeaderScheduledLeave;
