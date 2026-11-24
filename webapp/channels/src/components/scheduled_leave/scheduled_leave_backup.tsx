// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect} from 'react';
import {FormattedMessage} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';

import type {UserProfile} from '@mattermost/types/users';

import {getMissingProfilesByIds} from 'mattermost-redux/actions/users';
import {Client4} from 'mattermost-redux/client';
import {getTeammateNameDisplaySetting} from 'mattermost-redux/selectors/entities/preferences';
import {getUser} from 'mattermost-redux/selectors/entities/users';
import {displayUsername} from 'mattermost-redux/utils/user_utils';

import ProfilePopover from 'components/profile_popover';

import type {GlobalState} from 'types/store';

type Props = {
    userId: UserProfile['id'];
};

/**
 * "Backup: @name" for a scheduled leave, where the mention opens the backup's profile popover. Renders nothing for
 * a backup that is deactivated or not loaded, since the leave owner may have picked someone who has since left.
 */
const ScheduledLeaveBackup = ({userId}: Props) => {
    const dispatch = useDispatch();
    const user = useSelector((state: GlobalState) => getUser(state, userId));
    const teammateNameDisplay = useSelector(getTeammateNameDisplaySetting);

    const isLoaded = Boolean(user);
    useEffect(() => {
        if (!isLoaded) {
            dispatch(getMissingProfilesByIds([userId]));
        }
    }, [userId, isLoaded, dispatch]);

    if (!user || user.delete_at > 0) {
        return null;
    }

    return (
        <span className='scheduled-leave-backup'>
            <FormattedMessage
                id='scheduled_leave.backup'
                defaultMessage='Backup: {mention}'
                description='Backup contact of a user on scheduled leave; {mention} is an @username that opens their profile.'
                values={{
                    mention: (
                        <ProfilePopover
                            triggerComponentAs='button'
                            triggerComponentClass='style--none'
                            userId={user.id}
                            src={Client4.getProfilePictureUrl(user.id, user.last_picture_update)}
                        >
                            <span className='mention-link'>
                                {'@' + displayUsername(user, teammateNameDisplay)}
                            </span>
                        </ProfilePopover>
                    ),
                }}
            />
        </span>
    );
};

export default ScheduledLeaveBackup;
