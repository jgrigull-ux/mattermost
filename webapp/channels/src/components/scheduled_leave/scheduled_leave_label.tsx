// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {ScheduledLeave} from '@mattermost/types/users';

type Props = {
    leave: ScheduledLeave;
    upcoming?: boolean;
    showBackup?: boolean;
};

const ScheduledLeaveLabel = (props: Props) => {
    return null;
};

export default ScheduledLeaveLabel;
