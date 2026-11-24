// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

import "net/http"

const (
	UserPropsKeyScheduledLeave = "scheduledLeave"

	ScheduledLeaveMaxDurationMillis        = int64(365 * 24 * 60 * 60 * 1000)
	ScheduledLeaveNoteMaxRunes             = 500
	ScheduledLeaveAutoReplyMessageMaxRunes = 1000
)

// ScheduledLeave is a date-ranged leave stored in User.Props under UserPropsKeyScheduledLeave.
// The user is on leave while StartAt <= now < EndAt; EndAt is the return time.
type ScheduledLeave struct {
	StartAt          int64  `json:"start_at"`
	EndAt            int64  `json:"end_at"`
	Timezone         string `json:"timezone,omitempty"`
	BackupUserId     string `json:"backup_user_id,omitempty"`
	Note             string `json:"note,omitempty"`
	AutoReplyEnabled bool   `json:"auto_reply_enabled"`
	AutoReplyMessage string `json:"auto_reply_message,omitempty"`
}

func (sl *ScheduledLeave) IsValid() *AppError {
	return NewAppError("ScheduledLeave.IsValid", "not_implemented", nil, "", http.StatusNotImplemented)
}

func (sl *ScheduledLeave) IsActive(now int64) bool {
	return false
}
