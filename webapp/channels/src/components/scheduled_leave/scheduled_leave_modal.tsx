// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Moment} from 'moment-timezone';
import moment from 'moment-timezone';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {FormattedMessage, defineMessages, useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';

import {Switch} from '@mattermost/compass-ui/components/switch';
import {TextArea} from '@mattermost/compass-ui/components/text-area';
import {GenericModal} from '@mattermost/components';
import type {ScheduledLeave, UserProfile} from '@mattermost/types/users';

import {getMissingProfilesByIds, setScheduledLeave} from 'mattermost-redux/actions/users';
import {getCurrentTimezone} from 'mattermost-redux/selectors/entities/timezone';
import {getCurrentUser, getUser} from 'mattermost-redux/selectors/entities/users';

import {autocompleteUsers} from 'actions/user_actions';
import {closeModal} from 'actions/views/modals';

import DateTimeInput, {getRoundedTime} from 'components/datetime_input/datetime_input';
import GenericUserProvider from 'components/suggestion/generic_user_provider';
import SuggestionBox from 'components/suggestion/suggestion_box';
import type {SuggestionBoxElement} from 'components/suggestion/suggestion_box/suggestion_box';
import SuggestionList from 'components/suggestion/suggestion_list';

import {Constants, ModalIdentifiers} from 'utils/constants';
import {isKeyPressed} from 'utils/keyboard';
import {getCurrentMomentForTimezone} from 'utils/timezone';

import type {GlobalState} from 'types/store';

import {getFieldForServerError, isScheduledLeaveEnded, parseScheduledLeave} from './utils';
import type {ScheduledLeaveField} from './utils';

import './scheduled_leave_modal.scss';

const NOTE_MAX_LENGTH = 500;
const AUTO_REPLY_MESSAGE_MAX_LENGTH = 1000;

type Props = {
    onExited: () => void;
};

type FieldErrors = Partial<Record<ScheduledLeaveField, string>>;

const messages = defineMessages({
    scheduleTitle: {id: 'scheduled_leave.modal.title.schedule', defaultMessage: 'Schedule leave', description: 'Title of the dialog where a user plans an upcoming leave (time off).'},
    editTitle: {id: 'scheduled_leave.modal.title.edit', defaultMessage: 'Edit leave', description: 'Title of the dialog where a user changes a leave (time off) they already scheduled.'},
    backupPlaceholder: {id: 'scheduled_leave.modal.backup.placeholder', defaultMessage: 'Search for a person', description: 'Placeholder in the field for choosing a colleague to contact while the user is on leave.'},
    notePlaceholder: {id: 'scheduled_leave.modal.note.placeholder', defaultMessage: 'Add details for people who look you up', description: 'Placeholder for an optional note about the leave, shown to people who view the user\'s profile.'},
    autoReplyLabel: {id: 'scheduled_leave.modal.autoReply.label', defaultMessage: 'Send an automatic reply', description: 'Toggle that turns on an automatic reply to direct messages during the leave.'},
    autoReplyPlaceholder: {id: 'scheduled_leave.modal.autoReply.placeholder', defaultMessage: 'Leave empty to send a default message', description: 'Placeholder for the automatic reply text; an empty text sends a default reply.'},
    backupNotSelected: {id: 'scheduled_leave.modal.error.backupNotSelected', defaultMessage: 'Select a person from the list.', description: 'Error when the user typed a name in the backup contact field without picking a person from the suggestions.'},
    startRequired: {id: 'scheduled_leave.modal.error.startRequired', defaultMessage: 'Choose a start date.', description: 'Error when the leave has no valid start date or time.'},
    endRequired: {id: 'scheduled_leave.modal.error.endRequired', defaultMessage: 'Choose an end date.', description: 'Error when the leave has no valid end date or time.'},
    endBeforeStart: {id: 'scheduled_leave.modal.error.endBeforeStart', defaultMessage: 'The end date must be after the start date.', description: 'Error when the leave ends on or before its start.'},
    tooLong: {id: 'scheduled_leave.modal.error.tooLong', defaultMessage: 'Leave can last at most 365 days.', description: 'Error when the leave is longer than the 365-day limit.'},
    endInPast: {id: 'scheduled_leave.modal.error.endInPast', defaultMessage: 'The end date must be in the future.', description: 'Error when the leave end date has already passed.'},
    backupSelf: {id: 'scheduled_leave.modal.error.backupSelf', defaultMessage: 'You can\'t be your own backup contact.', description: 'Error when the user picks themself as their backup contact.'},
    backupInvalid: {id: 'scheduled_leave.modal.error.backupInvalid', defaultMessage: 'This person doesn\'t exist or is deactivated. Choose someone else.', description: 'Error when the chosen backup contact is unknown or deactivated.'},
    noteTooLong: {id: 'scheduled_leave.modal.error.noteTooLong', defaultMessage: 'The note can be at most 500 characters.', description: 'Error when the leave note is over its 500-character limit.'},
    autoReplyTooLong: {id: 'scheduled_leave.modal.error.autoReplyTooLong', defaultMessage: 'The automatic reply can be at most 1000 characters.', description: 'Error when the automatic reply is over its 1000-character limit.'},
});

const messagesByServerErrorId: Record<string, typeof messages[keyof typeof messages]> = {
    'model.scheduled_leave.is_valid.start_at.app_error': messages.startRequired,
    'model.scheduled_leave.is_valid.end_at.app_error': messages.endBeforeStart,
    'model.scheduled_leave.is_valid.duration.app_error': messages.tooLong,
    'app.scheduled_leave.set.end_in_past.app_error': messages.endInPast,
    'model.scheduled_leave.is_valid.backup_user_id.app_error': messages.backupInvalid,
    'app.scheduled_leave.set.backup_self.app_error': messages.backupSelf,
    'app.scheduled_leave.set.backup_invalid.app_error': messages.backupInvalid,
    'model.scheduled_leave.is_valid.note.app_error': messages.noteTooLong,
    'model.scheduled_leave.is_valid.auto_reply_message.app_error': messages.autoReplyTooLong,
};

function formatUsername(user?: UserProfile) {
    return user ? `@${user.username}` : '';
}

export default function ScheduledLeaveModal(props: Props) {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();

    const currentUser = useSelector(getCurrentUser);
    const timezone = useSelector(getCurrentTimezone);

    // An ended leave is still stored until replaced, but it shouldn't be offered for editing.
    const existingLeave = useMemo(() => {
        const leave = parseScheduledLeave(currentUser);
        return leave && !isScheduledLeaveEnded(leave, Date.now()) ? leave : undefined;

    // Only read once, so a websocket update while the modal is open doesn't reset the form
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const savedBackup = useSelector((state: GlobalState) => (existingLeave?.backup_user_id ? getUser(state, existingLeave.backup_user_id) : undefined));

    const [start, setStart] = useState<Moment | null>(() => {
        if (existingLeave) {
            return moment.tz(existingLeave.start_at, timezone || moment.tz.guess());
        }
        return getRoundedTime(getCurrentMomentForTimezone(timezone));
    });
    const [end, setEnd] = useState<Moment | null>(() => {
        if (existingLeave) {
            return moment.tz(existingLeave.end_at, timezone || moment.tz.guess());
        }

        // 24 hours rather than one calendar day, so the default is a full day even across a DST change
        return getRoundedTime(getCurrentMomentForTimezone(timezone)).add(24, 'hours');
    });
    const [backupUserId, setBackupUserId] = useState(existingLeave?.backup_user_id ?? '');
    const [backupText, setBackupText] = useState(formatUsername(savedBackup));
    const [note, setNote] = useState(existingLeave?.note ?? '');
    const [autoReplyEnabled, setAutoReplyEnabled] = useState(existingLeave?.auto_reply_enabled ?? false);
    const [autoReplyMessage, setAutoReplyMessage] = useState(existingLeave?.auto_reply_message ?? '');

    const [errors, setErrors] = useState<FieldErrors>({});
    const [saving, setSaving] = useState(false);
    const [isInteracting, setIsInteracting] = useState(false);
    const [startTimeInvalid, setStartTimeInvalid] = useState(false);
    const [endTimeInvalid, setEndTimeInvalid] = useState(false);

    const userProviders = useRef([new GenericUserProvider((term: string) => dispatch(autocompleteUsers(term)))]);

    useEffect(() => {
        if (existingLeave?.backup_user_id && !savedBackup) {
            dispatch(getMissingProfilesByIds([existingLeave.backup_user_id]));
        }
    }, [dispatch, existingLeave, savedBackup]);

    // Fill in the backup's name once its profile has loaded. Editing the text clears backupUserId, so this
    // never overwrites what the user typed.
    useEffect(() => {
        if (savedBackup && backupUserId === savedBackup.id && !backupText) {
            setBackupText(formatUsername(savedBackup));
        }
    }, [savedBackup, backupUserId, backupText]);

    const close = useCallback(() => {
        dispatch(closeModal(ModalIdentifiers.SCHEDULED_LEAVE));
    }, [dispatch]);

    // Escape closes the modal unless it is closing a date or time picker inside it
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (isKeyPressed(event, Constants.KeyCodes.ESCAPE) && !isInteracting) {
                close();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isInteracting, close]);

    function clearError(field: ScheduledLeaveField) {
        setErrors((current) => ({...current, [field]: undefined, general: undefined}));
    }

    function validate(): FieldErrors {
        const found: FieldErrors = {};
        if (!start || startTimeInvalid) {
            found.start = formatMessage(messages.startRequired);
        }
        if (!end || endTimeInvalid) {
            found.end = formatMessage(messages.endRequired);
        } else if (start && !end.isAfter(start)) {
            found.end = formatMessage(messages.endBeforeStart);
        }
        if (backupText.trim() && !backupUserId) {
            found.backup = formatMessage(messages.backupNotSelected);
        }
        return found;
    }

    async function handleSave() {
        if (saving || isInteracting) {
            return;
        }

        const found = validate();
        if (Object.keys(found).length > 0) {
            setErrors(found);
            return;
        }

        const leave: ScheduledLeave = {
            start_at: start!.valueOf(),
            end_at: end!.valueOf(),
            auto_reply_enabled: autoReplyEnabled,
        };
        if (timezone) {
            leave.timezone = timezone;
        }
        if (backupUserId) {
            leave.backup_user_id = backupUserId;
        }
        if (note.trim()) {
            leave.note = note.trim();
        }
        if (autoReplyEnabled && autoReplyMessage.trim()) {
            leave.auto_reply_message = autoReplyMessage.trim();
        }

        setSaving(true);
        setErrors({});
        const result = await dispatch(setScheduledLeave(leave));
        setSaving(false);

        if (result.error) {
            const serverErrorId = result.error.server_error_id;
            const descriptor = serverErrorId ? messagesByServerErrorId[serverErrorId] : undefined;
            setErrors({[getFieldForServerError(serverErrorId)]: descriptor ? formatMessage(descriptor) : result.error.message});
            return;
        }

        close();
    }

    function handleBackupChange(e: React.ChangeEvent<SuggestionBoxElement>) {
        setBackupText(e.target.value);
        setBackupUserId('');
        clearError('backup');
    }

    function handleBackupSelected(user: UserProfile) {
        setBackupText(formatUsername(user));
        setBackupUserId(user.id);
        clearError('backup');
    }

    function renderFieldError(field: ScheduledLeaveField) {
        if (!errors[field]) {
            return null;
        }
        return (
            <div
                id={`scheduledLeave_${field}Error`}
                className='ScheduledLeaveModal__error'
                role='alert'
            >
                <i
                    className='icon icon-alert-circle-outline'
                    aria-hidden='true'
                />
                {errors[field]}
            </div>
        );
    }

    function renderDateField(field: 'start' | 'end') {
        const isStart = field === 'start';
        const legendId = `scheduledLeave_${field}Legend`;
        return (
            <fieldset
                className='ScheduledLeaveModal__dateField'
                aria-labelledby={legendId}
                aria-invalid={Boolean(errors[field])}
                aria-describedby={errors[field] ? `scheduledLeave_${field}Error` : undefined}
            >
                <legend
                    id={legendId}
                    className='ScheduledLeaveModal__label'
                >
                    {isStart ? (
                        <FormattedMessage
                            id='scheduled_leave.modal.start.label'
                            defaultMessage='Starts'
                            description='Label for the date and time the leave starts.'
                        />
                    ) : (
                        <FormattedMessage
                            id='scheduled_leave.modal.end.label'
                            defaultMessage='Ends'
                            description='Label for the date and time the leave ends, when the user is back.'
                        />
                    )}
                </legend>
                <DateTimeInput
                    time={isStart ? start : end}
                    handleChange={(date) => {
                        (isStart ? setStart : setEnd)(date);
                        clearError(field);
                    }}
                    timezone={timezone}
                    setIsInteracting={setIsInteracting}
                    allowPastDates={isStart}
                    manualTimeEntry={true}
                    onTimeInputError={isStart ? setStartTimeInvalid : setEndTimeInvalid}
                />
                {renderFieldError(field)}
            </fieldset>
        );
    }

    const title = formatMessage(existingLeave ? messages.editTitle : messages.scheduleTitle);

    return (
        <GenericModal
            id='scheduledLeaveModal'
            className='ScheduledLeaveModal'
            compassDesign={true}
            enforceFocus={false}
            onExited={props.onExited}
            modalHeaderText={title}
            ariaLabel={title}
            confirmButtonText={
                <FormattedMessage
                    id='scheduled_leave.modal.save'
                    defaultMessage='Save'
                    description='Button that saves the scheduled leave.'
                />
            }
            cancelButtonText={
                <FormattedMessage
                    id='scheduled_leave.modal.cancel'
                    defaultMessage='Cancel'
                    description='Button that closes the leave dialog without saving.'
                />
            }
            handleConfirm={handleSave}
            handleCancel={close}
            isConfirmLoading={saving}
            autoCloseOnConfirmButton={false}
            keyboardEscape={false}
            errorText={errors.general}
            bodyOverflowVisible={true}
        >
            <div className='ScheduledLeaveModal__body'>
                <div className='ScheduledLeaveModal__dates'>
                    {renderDateField('start')}
                    {renderDateField('end')}
                </div>
                <div className='ScheduledLeaveModal__field'>
                    <label
                        htmlFor='scheduledLeave_backup'
                        className='ScheduledLeaveModal__label'
                    >
                        <FormattedMessage
                            id='scheduled_leave.modal.backup.label'
                            defaultMessage='Backup contact'
                            description='Label for the colleague people should contact while the user is on leave.'
                        />
                    </label>
                    <SuggestionBox
                        id='scheduledLeave_backup'
                        className='form-control'
                        placeholder={formatMessage(messages.backupPlaceholder)}
                        value={backupText}
                        onChange={handleBackupChange}
                        onItemSelected={handleBackupSelected}
                        listComponent={SuggestionList}
                        listPosition='bottom'
                        providers={userProviders.current}
                        requiredCharacters={1}
                        aria-invalid={Boolean(errors.backup)}
                        aria-describedby={errors.backup ? 'scheduledLeave_backupError' : undefined}
                    />
                    {renderFieldError('backup')}
                </div>
                <TextArea
                    id='scheduledLeave_note'
                    className='ScheduledLeaveModal__field'
                    label={
                        <FormattedMessage
                            id='scheduled_leave.modal.note.label'
                            defaultMessage='Note'
                            description='Label for an optional note about the leave.'
                        />
                    }
                    placeholder={formatMessage(messages.notePlaceholder)}
                    value={note}
                    onChange={(e) => {
                        setNote(e.target.value);
                        clearError('note');
                    }}
                    maxLength={NOTE_MAX_LENGTH}
                    showCharacterCount={true}
                    rows={2}
                    invalid={Boolean(errors.note)}
                    message={errors.note}
                    messageTone={errors.note ? 'error' : undefined}
                />
                <div className='ScheduledLeaveModal__field'>
                    <Switch
                        id='scheduledLeave_autoReply'
                        checked={autoReplyEnabled}
                        onChange={(e) => {
                            setAutoReplyEnabled(e.target.checked);
                            clearError('message');
                        }}
                        aria-label={formatMessage(messages.autoReplyLabel)}
                        aria-describedby='scheduledLeave_autoReplyHelp'
                        secondaryLabel={
                            <span id='scheduledLeave_autoReplyHelp'>
                                <FormattedMessage
                                    id='scheduled_leave.modal.autoReply.help'
                                    defaultMessage='Reply to direct messages while you are on leave'
                                    description='Explains the automatic reply toggle.'
                                />
                            </span>
                        }
                    >
                        {formatMessage(messages.autoReplyLabel)}
                    </Switch>
                </div>
                {autoReplyEnabled && (
                    <TextArea
                        id='scheduledLeave_autoReplyMessage'
                        className='ScheduledLeaveModal__field'
                        label={
                            <FormattedMessage
                                id='scheduled_leave.modal.autoReplyMessage.label'
                                defaultMessage='Automatic reply message'
                                description='Label for the text of the automatic reply sent during the leave.'
                            />
                        }
                        placeholder={formatMessage(messages.autoReplyPlaceholder)}
                        value={autoReplyMessage}
                        onChange={(e) => {
                            setAutoReplyMessage(e.target.value);
                            clearError('message');
                        }}
                        maxLength={AUTO_REPLY_MESSAGE_MAX_LENGTH}
                        showCharacterCount={true}
                        rows={3}
                        invalid={Boolean(errors.message)}
                        message={errors.message}
                        messageTone={errors.message ? 'error' : undefined}
                    />
                )}
            </div>
        </GenericModal>
    );
}
