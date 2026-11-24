// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

type Props = {
    timezone?: string;
};

export default function UserAccountScheduledLeaveMenuItem(props: Props) {
    return props.timezone ? null : null;
}
