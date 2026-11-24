// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import type {ScheduledLeave} from '@mattermost/types/users';

import * as userActions from 'mattermost-redux/actions/users';

import * as modalActions from 'actions/views/modals';

import {renderWithContext, screen, userEvent, waitFor, within} from 'tests/react_testing_utils';
import {ModalIdentifiers} from 'utils/constants';
import {TestHelper} from 'utils/test_helper';

import ScheduledLeaveModal from './scheduled_leave_modal';

const DAY = 24 * 60 * 60 * 1000;

describe('ScheduledLeaveModal', () => {
    const currentUser = TestHelper.getUserMock({
        id: 'current_user_id',
        timezone: {useAutomaticTimezone: 'false', automaticTimezone: '', manualTimezone: 'America/New_York'},
    });
    const backupUser = TestHelper.getUserMock({id: 'backup_user_id', username: 'backup.person'});

    let setSpy: jest.SpyInstance;

    function renderModal(leave?: ScheduledLeave) {
        const props: Record<string, string> = {};
        if (leave) {
            props.scheduledLeave = JSON.stringify(leave);
        }

        return renderWithContext(
            <ScheduledLeaveModal onExited={jest.fn()}/>,
            {
                entities: {
                    users: {
                        currentUserId: currentUser.id,
                        profiles: {
                            [currentUser.id]: {...currentUser, props},
                            [backupUser.id]: backupUser,
                        },
                    },
                },
            },
        );
    }

    function savedLeave(): ScheduledLeave {
        return setSpy.mock.calls[setSpy.mock.calls.length - 1][0];
    }

    beforeEach(() => {
        jest.restoreAllMocks();
        setSpy = jest.spyOn(userActions, 'setScheduledLeave').mockImplementation((leave) => async () => ({data: leave}));
        jest.spyOn(userActions, 'autocompleteUsers').mockReturnValue(async () => ({data: {users: []}}));
    });

    test('labels every field so it can be used with a screen reader', () => {
        renderModal();

        expect(screen.getByRole('dialog', {name: 'Schedule leave'})).toBeInTheDocument();
        expect(screen.getByRole('group', {name: 'Starts'})).toBeInTheDocument();
        expect(screen.getByRole('group', {name: 'Ends'})).toBeInTheDocument();
        expect(screen.getByLabelText('Backup contact')).toBeInTheDocument();
        expect(screen.getByLabelText('Note')).toBeInTheDocument();
        expect(screen.getByRole('switch', {name: 'Send an automatic reply'})).not.toBeChecked();
        expect(screen.queryByLabelText('Automatic reply message')).not.toBeInTheDocument();
    });

    test('saves a new one-day leave with the auto-reply turned on and closes', async () => {
        const closeSpy = jest.spyOn(modalActions, 'closeModal');
        renderModal();

        await userEvent.type(screen.getByLabelText('Note'), '  Family trip ');
        await userEvent.click(screen.getByRole('switch', {name: 'Send an automatic reply'}));
        await userEvent.type(screen.getByLabelText('Automatic reply message'), 'Back on Monday');
        await userEvent.click(screen.getByRole('button', {name: 'Save'}));

        await waitFor(() => expect(setSpy).toHaveBeenCalledTimes(1));
        const leave = savedLeave();
        expect(leave.end_at - leave.start_at).toBe(DAY);
        expect(leave.end_at).toBeGreaterThan(Date.now());
        expect(leave).toMatchObject({
            timezone: 'America/New_York',
            note: 'Family trip',
            auto_reply_enabled: true,
            auto_reply_message: 'Back on Monday',
        });
        expect(leave).not.toHaveProperty('backup_user_id');
        await waitFor(() => expect(closeSpy).toHaveBeenCalledWith(ModalIdentifiers.SCHEDULED_LEAVE));
    });

    test('saves an enabled auto-reply with an empty message', async () => {
        renderModal();

        await userEvent.click(screen.getByRole('switch', {name: 'Send an automatic reply'}));
        await userEvent.click(screen.getByRole('button', {name: 'Save'}));

        await waitFor(() => expect(setSpy).toHaveBeenCalledTimes(1));
        expect(savedLeave().auto_reply_enabled).toBe(true);
        expect(savedLeave()).not.toHaveProperty('auto_reply_message');
    });

    test('pre-fills an existing leave and saves it unchanged', async () => {
        const existing: ScheduledLeave = {
            start_at: Date.now() + DAY,
            end_at: Date.now() + (5 * DAY),
            timezone: 'America/New_York',
            backup_user_id: backupUser.id,
            note: 'Conference',
            auto_reply_enabled: true,
            auto_reply_message: 'At a conference',
        };
        renderModal(existing);

        expect(screen.getByRole('dialog', {name: 'Edit leave'})).toBeInTheDocument();
        expect(screen.getByLabelText('Backup contact')).toHaveValue('@backup.person');
        expect(screen.getByLabelText('Note')).toHaveValue('Conference');
        expect(screen.getByRole('switch', {name: 'Send an automatic reply'})).toBeChecked();
        expect(screen.getByLabelText('Automatic reply message')).toHaveValue('At a conference');

        await userEvent.click(screen.getByRole('button', {name: 'Save'}));

        await waitFor(() => expect(setSpy).toHaveBeenCalledTimes(1));
        expect(savedLeave()).toEqual(existing);
    });

    test('opens empty when the stored leave has already ended', () => {
        renderModal({start_at: Date.now() - (3 * DAY), end_at: Date.now() - DAY, note: 'Old', auto_reply_enabled: true});

        expect(screen.getByRole('dialog', {name: 'Schedule leave'})).toBeInTheDocument();
        expect(screen.getByLabelText('Note')).toHaveValue('');
        expect(screen.getByRole('switch', {name: 'Send an automatic reply'})).not.toBeChecked();
    });

    test('turning the auto-reply off hides the message and saves it as disabled', async () => {
        renderModal({
            start_at: Date.now() + DAY,
            end_at: Date.now() + (2 * DAY),
            auto_reply_enabled: true,
            auto_reply_message: 'Away',
        });

        await userEvent.click(screen.getByRole('switch', {name: 'Send an automatic reply'}));
        expect(screen.queryByLabelText('Automatic reply message')).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', {name: 'Save'}));

        await waitFor(() => expect(setSpy).toHaveBeenCalledTimes(1));
        expect(savedLeave().auto_reply_enabled).toBe(false);
    });

    test('shows a server validation error next to the end date and keeps the modal open', async () => {
        const closeSpy = jest.spyOn(modalActions, 'closeModal');
        setSpy.mockImplementation(() => async () => ({error: {
            server_error_id: 'app.scheduled_leave.set.end_in_past.app_error',
            message: 'The leave end date must be in the future.',
        }}));
        renderModal();

        await userEvent.click(screen.getByRole('button', {name: 'Save'}));

        const endGroup = screen.getByRole('group', {name: 'Ends'});
        expect(await within(endGroup).findByRole('alert')).toHaveTextContent('The end date must be in the future.');
        expect(endGroup).toHaveAttribute('aria-invalid', 'true');
        expect(closeSpy).not.toHaveBeenCalled();
    });

    test('shows a server backup error next to the backup contact', async () => {
        setSpy.mockImplementation(() => async () => ({error: {
            server_error_id: 'app.scheduled_leave.set.backup_self.app_error',
            message: 'You can\'t be your own backup contact.',
        }}));
        renderModal({start_at: Date.now(), end_at: Date.now() + DAY, backup_user_id: backupUser.id, auto_reply_enabled: false});

        await userEvent.click(screen.getByRole('button', {name: 'Save'}));

        const backup = screen.getByLabelText('Backup contact');
        await waitFor(() => expect(backup).toHaveAttribute('aria-invalid', 'true'));
        expect(backup).toHaveAccessibleDescription(/can't be your own backup contact/);
    });

    test('shows an unknown server error in the modal', async () => {
        setSpy.mockImplementation(() => async () => ({error: {
            server_error_id: 'api.context.permissions.app_error',
            message: 'You do not have the appropriate permissions.',
        }}));
        renderModal();

        await userEvent.click(screen.getByRole('button', {name: 'Save'}));

        expect(await screen.findByText('You do not have the appropriate permissions.')).toBeInTheDocument();
    });

    test('asks to pick a backup from the list instead of saving typed text', async () => {
        renderModal();

        await userEvent.type(screen.getByLabelText('Backup contact'), 'nobody');
        await userEvent.click(screen.getByRole('button', {name: 'Save'}));

        const backup = screen.getByLabelText('Backup contact');
        await waitFor(() => expect(backup).toHaveAttribute('aria-invalid', 'true'));
        expect(backup).toHaveAccessibleDescription('Select a person from the list.');
        expect(setSpy).not.toHaveBeenCalled();
    });

    test('clearing the backup text removes the backup contact', async () => {
        renderModal({start_at: Date.now(), end_at: Date.now() + DAY, backup_user_id: backupUser.id, auto_reply_enabled: false});

        await userEvent.clear(screen.getByLabelText('Backup contact'));
        await userEvent.click(screen.getByRole('button', {name: 'Save'}));

        await waitFor(() => expect(setSpy).toHaveBeenCalledTimes(1));
        expect(savedLeave()).not.toHaveProperty('backup_user_id');
    });
});
