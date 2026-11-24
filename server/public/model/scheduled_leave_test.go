// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package model

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func validScheduledLeave() *ScheduledLeave {
	start := GetMillis()
	return &ScheduledLeave{
		StartAt:          start,
		EndAt:            start + 7*24*60*60*1000,
		Timezone:         "America/Los_Angeles",
		BackupUserId:     NewId(),
		Note:             "Family trip",
		AutoReplyEnabled: true,
		AutoReplyMessage: "Back on the 8th",
	}
}

func TestScheduledLeaveIsValid(t *testing.T) {
	testCases := []struct {
		name    string
		modify  func(sl *ScheduledLeave)
		errorID string
	}{
		{name: "valid", modify: func(sl *ScheduledLeave) {}},
		{name: "valid with only required fields", modify: func(sl *ScheduledLeave) {
			*sl = ScheduledLeave{StartAt: sl.StartAt, EndAt: sl.EndAt}
		}},
		{name: "valid with auto reply on and empty message", modify: func(sl *ScheduledLeave) {
			sl.AutoReplyEnabled = true
			sl.AutoReplyMessage = ""
		}},
		{name: "valid with exactly the maximum duration", modify: func(sl *ScheduledLeave) {
			sl.EndAt = sl.StartAt + ScheduledLeaveMaxDurationMillis
		}},
		{name: "valid with note at the rune limit", modify: func(sl *ScheduledLeave) {
			sl.Note = strings.Repeat("é", ScheduledLeaveNoteMaxRunes)
		}},
		{name: "valid with auto reply message at the rune limit", modify: func(sl *ScheduledLeave) {
			sl.AutoReplyMessage = strings.Repeat("é", ScheduledLeaveAutoReplyMessageMaxRunes)
		}},
		{name: "missing start", errorID: "model.scheduled_leave.is_valid.start_at.app_error", modify: func(sl *ScheduledLeave) {
			sl.StartAt = 0
		}},
		{name: "negative start", errorID: "model.scheduled_leave.is_valid.start_at.app_error", modify: func(sl *ScheduledLeave) {
			sl.StartAt = -1
		}},
		{name: "end before start", errorID: "model.scheduled_leave.is_valid.end_at.app_error", modify: func(sl *ScheduledLeave) {
			sl.EndAt = sl.StartAt - 1
		}},
		{name: "end equal to start", errorID: "model.scheduled_leave.is_valid.end_at.app_error", modify: func(sl *ScheduledLeave) {
			sl.EndAt = sl.StartAt
		}},
		{name: "longer than one year", errorID: "model.scheduled_leave.is_valid.duration.app_error", modify: func(sl *ScheduledLeave) {
			sl.EndAt = sl.StartAt + ScheduledLeaveMaxDurationMillis + 1
		}},
		{name: "unknown timezone", errorID: "model.scheduled_leave.is_valid.timezone.app_error", modify: func(sl *ScheduledLeave) {
			sl.Timezone = "Mars/Olympus_Mons"
		}},
		{name: "malformed backup user id", errorID: "model.scheduled_leave.is_valid.backup_user_id.app_error", modify: func(sl *ScheduledLeave) {
			sl.BackupUserId = "not-an-id"
		}},
		{name: "note too long", errorID: "model.scheduled_leave.is_valid.note.app_error", modify: func(sl *ScheduledLeave) {
			sl.Note = strings.Repeat("a", ScheduledLeaveNoteMaxRunes+1)
		}},
		{name: "auto reply message too long", errorID: "model.scheduled_leave.is_valid.auto_reply_message.app_error", modify: func(sl *ScheduledLeave) {
			sl.AutoReplyMessage = strings.Repeat("a", ScheduledLeaveAutoReplyMessageMaxRunes+1)
		}},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			sl := validScheduledLeave()
			tc.modify(sl)

			appErr := sl.IsValid()
			if tc.errorID == "" {
				assert.Nil(t, appErr)
				return
			}
			require.NotNil(t, appErr)
			assert.Equal(t, tc.errorID, appErr.Id)
			assert.Equal(t, 400, appErr.StatusCode)
		})
	}
}

func TestScheduledLeaveIsActive(t *testing.T) {
	sl := &ScheduledLeave{StartAt: 1000, EndAt: 2000}

	assert.False(t, sl.IsActive(999), "one ms before start")
	assert.True(t, sl.IsActive(1000), "start is inclusive")
	assert.True(t, sl.IsActive(1500), "inside the window")
	assert.True(t, sl.IsActive(1999), "one ms before return")
	assert.False(t, sl.IsActive(2000), "end is exclusive")
	assert.False(t, sl.IsActive(3000), "after return")

	var nilLeave *ScheduledLeave
	assert.False(t, nilLeave.IsActive(1500), "nil leave is never active")
}

func TestUserScheduledLeaveProps(t *testing.T) {
	t.Run("set, get and clear round trip", func(t *testing.T) {
		u := &User{}
		sl := validScheduledLeave()

		require.NoError(t, u.SetScheduledLeave(sl))
		assert.Contains(t, u.Props[UserPropsKeyScheduledLeave], `"start_at":`)
		assert.Equal(t, sl, u.GetScheduledLeave())

		u.ClearScheduledLeave()
		_, exists := u.Props[UserPropsKeyScheduledLeave]
		assert.False(t, exists, "clear removes the key")
		assert.Nil(t, u.GetScheduledLeave())
	})

	t.Run("get returns nil when unset or unparsable", func(t *testing.T) {
		assert.Nil(t, (&User{}).GetScheduledLeave())
		assert.Nil(t, (&User{Props: StringMap{UserPropsKeyScheduledLeave: "{not json"}}).GetScheduledLeave())
	})

	t.Run("json field names are the downstream contract", func(t *testing.T) {
		u := &User{}
		require.NoError(t, u.SetScheduledLeave(&ScheduledLeave{StartAt: 1, EndAt: 2, BackupUserId: "b", AutoReplyEnabled: true}))
		assert.JSONEq(t, `{"start_at":1,"end_at":2,"backup_user_id":"b","auto_reply_enabled":true}`, u.Props[UserPropsKeyScheduledLeave])
	})
}

func TestUserIsValidScheduledLeave(t *testing.T) {
	newUser := func() *User {
		return &User{
			Id:       NewId(),
			CreateAt: GetMillis(),
			UpdateAt: GetMillis(),
			Username: NewUsername(),
			Email:    "test@example.org",
			Roles:    SystemUserRoleId,
			Locale:   DefaultLocale,
			Props:    StringMap{},
		}
	}

	t.Run("valid leave", func(t *testing.T) {
		u := newUser()
		require.NoError(t, u.SetScheduledLeave(validScheduledLeave()))
		assert.Nil(t, u.IsValid())
	})

	t.Run("empty prop is allowed", func(t *testing.T) {
		u := newUser()
		u.Props[UserPropsKeyScheduledLeave] = ""
		assert.Nil(t, u.IsValid())
	})

	t.Run("unparsable prop is rejected", func(t *testing.T) {
		u := newUser()
		u.Props[UserPropsKeyScheduledLeave] = "{not json"
		appErr := u.IsValid()
		require.NotNil(t, appErr)
		assert.Equal(t, "model.user.is_valid.invalidProperty.app_error", appErr.Id)
	})

	t.Run("structurally invalid leave is rejected", func(t *testing.T) {
		u := newUser()
		u.Props[UserPropsKeyScheduledLeave] = `{"start_at":2000,"end_at":1000}`
		appErr := u.IsValid()
		require.NotNil(t, appErr)
		assert.Equal(t, "model.user.is_valid.invalidProperty.app_error", appErr.Id)
	})
}
