// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import type {ScheduledLeave} from '@mattermost/types/users';

import * as userActions from 'mattermost-redux/actions/users';

import * as modalActions from 'actions/views/modals';

import * as Menu from 'components/menu';
import ScheduledLeaveModal from 'components/scheduled_leave/scheduled_leave_modal';

import {renderWithContext, screen, userEvent, waitFor} from 'tests/react_testing_utils';
import {ModalIdentifiers} from 'utils/constants';
import {TestHelper} from 'utils/test_helper';

import UserAccountScheduledLeaveMenuItem from './user_account_scheduled_leave_menuitem';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('UserAccountScheduledLeaveMenuItem', () => {
    const user = TestHelper.getUserMock({id: 'current_user_id'});

    function renderInMenu(leave?: ScheduledLeave | string) {
        const props: Record<string, string> = {};
        if (leave !== undefined) {
            props.scheduledLeave = typeof leave === 'string' ? leave : JSON.stringify(leave);
        }

        const state = {
            entities: {
                users: {
                    currentUserId: user.id,
                    profiles: {[user.id]: {...user, props}},
                },
            },
        };

        renderWithContext(
            <Menu.Container
                menuButton={{
                    id: 'test-menu-button',
                    'aria-label': 'open account menu',
                    children: 'menu',
                }}
                menu={{id: 'test-menu'}}
            >
                <UserAccountScheduledLeaveMenuItem timezone='UTC'/>
            </Menu.Container>,
            state,
        );
    }

    async function openMenu() {
        await userEvent.click(screen.getByLabelText('open account menu'));
    }

    beforeEach(() => {
        jest.restoreAllMocks();
    });

    test('shows "Schedule leave" when no leave is set, and opens the modal', async () => {
        const openModalSpy = jest.spyOn(modalActions, 'openModal');
        renderInMenu();
        await openMenu();

        expect(screen.queryByText(/On leave until/)).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole('menuitem', {name: /Schedule leave/}));

        await waitFor(() => expect(openModalSpy).toHaveBeenCalledWith(expect.objectContaining({
            modalId: ModalIdentifiers.SCHEDULED_LEAVE,
            dialogType: ScheduledLeaveModal,
        })));
    });

    test('shows "Schedule leave" when the stored leave is unparsable', async () => {
        renderInMenu('{broken');
        await openMenu();

        expect(screen.getByRole('menuitem', {name: /Schedule leave/})).toBeInTheDocument();
    });

    test('shows "Schedule leave" when the stored leave has ended', async () => {
        renderInMenu({start_at: Date.now() - (3 * DAY), end_at: Date.now() - DAY, auto_reply_enabled: false});
        await openMenu();

        expect(screen.getByRole('menuitem', {name: /Schedule leave/})).toBeInTheDocument();
        expect(screen.queryByText(/On leave until/)).not.toBeInTheDocument();
    });

    test('shows "On leave until" with Edit and End leave now while leave is active', async () => {
        renderInMenu({start_at: Date.now() - DAY, end_at: Date.now() + (2 * DAY), auto_reply_enabled: false});
        await openMenu();

        const item = screen.getByRole('menuitem', {name: /On leave until/});
        expect(screen.queryByText(/Starts/)).not.toBeInTheDocument();
        expect(screen.queryByRole('menuitem', {name: /^Schedule leave/})).not.toBeInTheDocument();

        await userEvent.hover(item);

        expect(screen.getByRole('menuitem', {name: 'Edit leave'})).toBeInTheDocument();
        expect(screen.getByRole('menuitem', {name: 'End leave now'})).toBeInTheDocument();
    });

    test('shows when an upcoming leave starts', async () => {
        renderInMenu({start_at: Date.now() + DAY, end_at: Date.now() + (3 * DAY), auto_reply_enabled: false});
        await openMenu();

        expect(screen.getByRole('menuitem', {name: /On leave until/})).toBeInTheDocument();
        expect(screen.getByText(/Starts/)).toBeInTheDocument();
    });

    test('Edit leave opens the modal', async () => {
        const openModalSpy = jest.spyOn(modalActions, 'openModal');
        renderInMenu({start_at: Date.now() - DAY, end_at: Date.now() + DAY, auto_reply_enabled: false});
        await openMenu();
        await userEvent.hover(screen.getByRole('menuitem', {name: /On leave until/}));
        await userEvent.click(screen.getByRole('menuitem', {name: 'Edit leave'}));

        await waitFor(() => expect(openModalSpy).toHaveBeenCalledWith(expect.objectContaining({
            modalId: ModalIdentifiers.SCHEDULED_LEAVE,
            dialogType: ScheduledLeaveModal,
        })));
    });

    test('End leave now clears the leave', async () => {
        const clearSpy = jest.spyOn(userActions, 'clearScheduledLeave').mockReturnValue(async () => ({data: true}));
        renderInMenu({start_at: Date.now() - DAY, end_at: Date.now() + DAY, auto_reply_enabled: false});
        await openMenu();
        await userEvent.hover(screen.getByRole('menuitem', {name: /On leave until/}));
        await userEvent.click(screen.getByRole('menuitem', {name: 'End leave now'}));

        await waitFor(() => expect(clearSpy).toHaveBeenCalledTimes(1));
    });
});
