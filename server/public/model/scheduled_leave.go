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
		return sl.invalidError("start_at")
	}
	if sl.EndAt <= sl.StartAt {
		return sl.invalidError("end_at")
	}
	if sl.EndAt-sl.StartAt > ScheduledLeaveMaxDurationMillis {
		return sl.invalidError("duration")
	}
	if sl.Timezone != "" {
		if _, err := time.LoadLocation(sl.Timezone); err != nil {
			return sl.invalidError("timezone").Wrap(err)
		}
	}
	if sl.BackupUserId != "" && !IsValidId(sl.BackupUserId) {
		return sl.invalidError("backup_user_id")
	}
	if utf8.RuneCountInString(sl.Note) > ScheduledLeaveNoteMaxRunes {
		return sl.invalidError("note")
	}
	if utf8.RuneCountInString(sl.AutoReplyMessage) > ScheduledLeaveAutoReplyMessageMaxRunes {
		return sl.invalidError("auto_reply_message")
	}
	return nil
}

func (sl *ScheduledLeave) invalidError(field string) *AppError {
	return NewAppError("ScheduledLeave.IsValid", "model.scheduled_leave.is_valid."+field+".app_error", map[string]any{
		"MaxDays":                  ScheduledLeaveMaxDurationMillis / (24 * 60 * 60 * 1000),
		"NoteMaxRunes":             ScheduledLeaveNoteMaxRunes,
		"AutoReplyMessageMaxRunes": ScheduledLeaveAutoReplyMessageMaxRunes,
	}, "", http.StatusBadRequest)
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
