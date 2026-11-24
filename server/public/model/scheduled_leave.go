// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

import (
	"net/http"
	"time"
	"unicode/utf8"
)

const (
	UserPropsKeyScheduledLeave = "scheduledLeave"

	ScheduledLeaveMaxDurationMillis        = int64(365 * 24 * 60 * 60 * 1000)
	ScheduledLeaveNoteMaxRunes             = 500
	ScheduledLeaveAutoReplyMessageMaxRunes = 1000
)

// ScheduledLeave is a date-ranged leave stored in User.Props under UserPropsKeyScheduledLeave.
// The user is on leave while StartAt <= now < EndAt; EndAt is the return time.
// Nothing clears the prop once EndAt passes, so readers must check IsActive.
type ScheduledLeave struct {
	StartAt          int64  `json:"start_at"`
	EndAt            int64  `json:"end_at"`
	Timezone         string `json:"timezone,omitempty"`
	BackupUserId     string `json:"backup_user_id,omitempty"`
	Note             string `json:"note,omitempty"`
	AutoReplyEnabled bool   `json:"auto_reply_enabled"`
	AutoReplyMessage string `json:"auto_reply_message,omitempty"`
}

// IsValid checks the leave's structure. It does not depend on the current time or on other users,
// so it is safe to run on stored leave from User.IsValid.
func (sl *ScheduledLeave) IsValid() *AppError {
	if sl.StartAt <= 0 {
		return NewAppError("ScheduledLeave.IsValid", "model.scheduled_leave.is_valid.start_at.app_error", scheduledLeaveErrorParams, "", http.StatusBadRequest)
	}
	if sl.EndAt <= sl.StartAt {
		return NewAppError("ScheduledLeave.IsValid", "model.scheduled_leave.is_valid.end_at.app_error", scheduledLeaveErrorParams, "", http.StatusBadRequest)
	}
	if sl.EndAt-sl.StartAt > ScheduledLeaveMaxDurationMillis {
		return NewAppError("ScheduledLeave.IsValid", "model.scheduled_leave.is_valid.duration.app_error", scheduledLeaveErrorParams, "", http.StatusBadRequest)
	}
	if sl.Timezone != "" {
		if _, err := time.LoadLocation(sl.Timezone); err != nil {
			return NewAppError("ScheduledLeave.IsValid", "model.scheduled_leave.is_valid.timezone.app_error", scheduledLeaveErrorParams, "", http.StatusBadRequest).Wrap(err)
		}
	}
	if sl.BackupUserId != "" && !IsValidId(sl.BackupUserId) {
		return NewAppError("ScheduledLeave.IsValid", "model.scheduled_leave.is_valid.backup_user_id.app_error", scheduledLeaveErrorParams, "", http.StatusBadRequest)
	}
	if utf8.RuneCountInString(sl.Note) > ScheduledLeaveNoteMaxRunes {
		return NewAppError("ScheduledLeave.IsValid", "model.scheduled_leave.is_valid.note.app_error", scheduledLeaveErrorParams, "", http.StatusBadRequest)
	}
	if utf8.RuneCountInString(sl.AutoReplyMessage) > ScheduledLeaveAutoReplyMessageMaxRunes {
		return NewAppError("ScheduledLeave.IsValid", "model.scheduled_leave.is_valid.auto_reply_message.app_error", scheduledLeaveErrorParams, "", http.StatusBadRequest)
	}
	return nil
}

var scheduledLeaveErrorParams = map[string]any{
	"MaxDays":                  ScheduledLeaveMaxDurationMillis / (24 * 60 * 60 * 1000),
	"NoteMaxRunes":             ScheduledLeaveNoteMaxRunes,
	"AutoReplyMessageMaxRunes": ScheduledLeaveAutoReplyMessageMaxRunes,
}

// Auditable leaves out Note and AutoReplyMessage, which are free text written by the user.
func (sl *ScheduledLeave) Auditable() map[string]any {
	return map[string]any{
		"start_at":           sl.StartAt,
		"end_at":             sl.EndAt,
		"timezone":           sl.Timezone,
		"backup_user_id":     sl.BackupUserId,
		"auto_reply_enabled": sl.AutoReplyEnabled,
	}
}

// IsActive reports whether now (epoch ms) falls inside the leave window.
func (sl *ScheduledLeave) IsActive(now int64) bool {
	if sl == nil {
		return false
	}
	return sl.StartAt <= now && now < sl.EndAt
}
