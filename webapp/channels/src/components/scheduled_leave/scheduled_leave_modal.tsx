// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import {GenericModal} from '@mattermost/components';

type Props = {
    onExited: () => void;
};

export default function ScheduledLeaveModal(props: Props) {
    return (
        <GenericModal
            onExited={props.onExited}
            compassDesign={true}
        >
            <div/>
        </GenericModal>
    );
}
