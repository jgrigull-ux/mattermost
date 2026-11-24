// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {getFieldForServerError, isScheduledLeaveEnded, parseScheduledLeave} from './utils';

const leave = {
    start_at: 1767225600000,
    end_at: 1767830400000,
    auto_reply_enabled: false,
};

describe('parseScheduledLeave', () => {
    test.each([
        ['no user', undefined],
        ['no props', {props: undefined as unknown as Record<string, string>}],
        ['missing key', {props: {}}],
        ['empty string', {props: {scheduledLeave: ''}}],
        ['bad JSON', {props: {scheduledLeave: '{not json'}}],
        ['JSON without times', {props: {scheduledLeave: '{"note":"x"}'}}],
        ['JSON null', {props: {scheduledLeave: 'null'}}],
    ])('returns undefined for %s', (_, user) => {
        expect(parseScheduledLeave(user)).toBeUndefined();
    });

    test('returns the parsed leave', () => {
        expect(parseScheduledLeave({props: {scheduledLeave: JSON.stringify(leave)}})).toEqual(leave);
    });
});

describe('isScheduledLeaveEnded', () => {
    test('is not ended one ms before end_at', () => {
        expect(isScheduledLeaveEnded(leave, leave.end_at - 1)).toBe(false);
    });

    test('is ended at end_at, since the end is exclusive', () => {
        expect(isScheduledLeaveEnded(leave, leave.end_at)).toBe(true);
    });

    test('is not ended before it starts', () => {
        expect(isScheduledLeaveEnded(leave, leave.start_at - 1000)).toBe(false);
    });
});

describe('getFieldForServerError', () => {
    test.each([
        ['model.scheduled_leave.is_valid.start_at.app_error', 'start'],
        ['model.scheduled_leave.is_valid.end_at.app_error', 'end'],
        ['model.scheduled_leave.is_valid.duration.app_error', 'end'],
        ['app.scheduled_leave.set.end_in_past.app_error', 'end'],
        ['model.scheduled_leave.is_valid.backup_user_id.app_error', 'backup'],
        ['app.scheduled_leave.set.backup_self.app_error', 'backup'],
        ['app.scheduled_leave.set.backup_invalid.app_error', 'backup'],
        ['model.scheduled_leave.is_valid.note.app_error', 'note'],
        ['model.scheduled_leave.is_valid.auto_reply_message.app_error', 'message'],
        ['model.scheduled_leave.is_valid.timezone.app_error', 'general'],
        ['api.context.permissions.app_error', 'general'],
        [undefined, 'general'],
    ])('maps %s to %s', (id, field) => {
        expect(getFieldForServerError(id)).toBe(field);
    });
});
