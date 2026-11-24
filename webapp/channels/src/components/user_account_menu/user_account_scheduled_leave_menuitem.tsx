// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';

import {CalendarOutlineIcon, ChevronRightIcon} from '@mattermost/compass-icons/components';

import {clearScheduledLeave} from 'mattermost-redux/actions/users';
import {getCurrentUser} from 'mattermost-redux/selectors/entities/users';

import {openModal} from 'actions/views/modals';

import * as Menu from 'components/menu';
import ScheduledLeaveModal from 'components/scheduled_leave/scheduled_leave_modal';
import {isScheduledLeaveEnded, parseScheduledLeave} from 'components/scheduled_leave/utils';

import {ModalIdentifiers} from 'utils/constants';

type Props = {
    timezone?: string;
};

export default function UserAccountScheduledLeaveMenuItem(props: Props) {
    const {formatDate} = useIntl();
    const dispatch = useDispatch();

    const currentUser = useSelector(getCurrentUser);
    const leave = parseScheduledLeave(currentUser);
    const now = Date.now();

    function openScheduledLeaveModal() {
        dispatch(openModal({
            modalId: ModalIdentifiers.SCHEDULED_LEAVE,
            dialogType: ScheduledLeaveModal,
        }));
    }

    function endLeaveNow() {
        dispatch(clearScheduledLeave());
    }

    const leadingElement = (
        <CalendarOutlineIcon
            size={18}
            className='userAccountMenu_scheduledLeaveMenuItem_icon'
        />
    );

    if (!leave || isScheduledLeaveEnded(leave, now)) {
        return (
            <Menu.Item
                className='userAccountMenu_scheduledLeaveMenuItem'
                leadingElement={leadingElement}
                labels={
                    <FormattedMessage
                        id='userAccountMenu.scheduledLeaveMenuItem.schedule'
                        defaultMessage='Schedule leave'
                        description='Account menu item that opens the dialog to plan a leave (time off).'
                    />
                }
                aria-haspopup={true}
                onClick={openScheduledLeaveModal}
            />
        );
    }

    const dateOptions = {timeZone: props.timezone, dateStyle: 'medium'} as const;
    const hasStarted = leave.start_at <= now;

    return (
        <Menu.SubMenu
            id='userAccountMenu.scheduledLeaveMenuItem'
            menuId='userAccountMenu.scheduledLeaveSubMenu'
            leadingElement={leadingElement}
            labels={
                <>
                    <FormattedMessage
                        id='userAccountMenu.scheduledLeaveMenuItem.onLeaveUntil'
                        defaultMessage='On leave until {date}'
                        description='Account menu item shown while a leave is scheduled; {date} is the date the user is back.'
                        values={{date: formatDate(leave.end_at, dateOptions)}}
                    />
                    {!hasStarted && (
                        <span>
                            <FormattedMessage
                                id='userAccountMenu.scheduledLeaveMenuItem.starts'
                                defaultMessage='Starts {date}'
                                description='Second line of the leave menu item for a leave that has not started; {date} is its start date.'
                                values={{date: formatDate(leave.start_at, dateOptions)}}
                            />
                        </span>
                    )}
                </>
            }
            trailingElements={<ChevronRightIcon size={16}/>}
        >
            <Menu.Item
                id='userAccountMenu.scheduledLeaveSubMenuItem.edit'
                labels={
                    <FormattedMessage
                        id='userAccountMenu.scheduledLeaveSubMenuItem.edit'
                        defaultMessage='Edit leave'
                        description='Account submenu item that opens the scheduled leave for editing.'
                    />
                }
                aria-haspopup={true}
                onClick={openScheduledLeaveModal}
            />
            <Menu.Item
                id='userAccountMenu.scheduledLeaveSubMenuItem.end'
                labels={
                    <FormattedMessage
                        id='userAccountMenu.scheduledLeaveSubMenuItem.end'
                        defaultMessage='End leave now'
                        description='Account submenu item that cancels the scheduled leave right away.'
                    />
                }
                isDestructive={true}
                onClick={endLeaveNow}
            />
        </Menu.SubMenu>
    );
}
