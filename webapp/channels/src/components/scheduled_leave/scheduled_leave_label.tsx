// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import {useSelector} from 'react-redux';

import type {ScheduledLeave} from '@mattermost/types/users';

import {getCurrentTimezone} from 'mattermost-redux/selectors/entities/timezone';

import ScheduledLeaveBackup from './scheduled_leave_backup';

import './scheduled_leave_label.scss';

type Props = {
    leave: ScheduledLeave;

    /** Show when the leave starts ("Away from ...") instead of when the user returns ("On leave until ..."). */
    upcoming?: boolean;
    showBackup?: boolean;
    className?: string;
};

/**
 * "On leave until Tue, Dec 8" (or "Away from ..." for upcoming leave) in the viewer's timezone, followed by the
 * backup contact when one is set.
 */
const ScheduledLeaveLabel = ({leave, upcoming = false, showBackup = true, className}: Props) => {
    const intl = useIntl();
    const timeZone = useSelector(getCurrentTimezone) || undefined;

    const time = upcoming ? leave.start_at : leave.end_at;
    const yearOf = (value: number) => intl.formatDate(value, {year: 'numeric', timeZone});
    const date = intl.formatDate(time, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: yearOf(time) === yearOf(Date.now()) ? undefined : 'numeric',
        timeZone,
    });

    return (
        <span className={classNames('scheduled-leave-label', className)}>
            <span className='scheduled-leave-label__date'>
                {upcoming ? (
                    <FormattedMessage
                        id='scheduled_leave.label.upcoming'
                        defaultMessage='Away from {date}'
                        description='Shown for a user whose scheduled leave starts soon; {date} is the start date, for example "Mon, Dec 8".'
                        values={{date}}
                    />
                ) : (
                    <FormattedMessage
                        id='scheduled_leave.label.active'
                        defaultMessage='On leave until {date}'
                        description='Shown for a user on scheduled leave; {date} is the day they return, for example "Mon, Dec 8".'
                        values={{date}}
                    />
                )}
            </span>
            {showBackup && leave.backup_user_id && (
                <ScheduledLeaveBackup userId={leave.backup_user_id}/>
            )}
        </span>
    );
};

export default ScheduledLeaveLabel;
