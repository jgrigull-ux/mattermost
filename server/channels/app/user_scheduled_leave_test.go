// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/mattermost/mattermost/server/public/model"
)

const scheduledLeaveDayMillis = int64(24 * 60 * 60 * 1000)

func TestScheduledLeave(t *testing.T) {
	mainHelper.Parallel(t)
	th := Setup(t).InitBasic(t)

	newLeave := func() *model.ScheduledLeave {
		now := model.GetMillis()
		return &model.ScheduledLeave{
			StartAt:          now + scheduledLeaveDayMillis,
			EndAt:            now + 8*scheduledLeaveDayMillis,
			Timezone:         "Europe/Berlin",
			BackupUserId:     th.BasicUser2.Id,
			Note:             "Hiking",
			AutoReplyEnabled: true,
			AutoReplyMessage: "Out hiking",
		}
	}

	t.Run("set, get and clear", func(t *testing.T) {
		leave := newLeave()

		saved, appErr := th.App.SetScheduledLeave(th.Context, th.BasicUser.Id, leave)
		require.Nil(t, appErr)
		assert.Equal(t, leave, saved)

		got, appErr := th.App.GetScheduledLeave(th.Context, th.BasicUser.Id)
		require.Nil(t, appErr)
		assert.Equal(t, leave, got)

		user, appErr := th.App.GetUser(th.Context, th.BasicUser.Id)
		require.Nil(t, appErr)
		assert.Equal(t, leave, user.GetScheduledLeave(), "leave is persisted in user props")

		appErr = th.App.ClearScheduledLeave(th.Context, th.BasicUser.Id)
		require.Nil(t, appErr)

		_, appErr = th.App.GetScheduledLeave(th.Context, th.BasicUser.Id)
		require.NotNil(t, appErr)
		assert.Equal(t, http.StatusNotFound, appErr.StatusCode)
		assert.Equal(t, "app.scheduled_leave.get.not_found.app_error", appErr.Id)
	})

	t.Run("clear without a leave is a no-op", func(t *testing.T) {
		before, appErr := th.App.GetUser(th.Context, th.BasicUser2.Id)
		require.Nil(t, appErr)

		require.Nil(t, th.App.ClearScheduledLeave(th.Context, th.BasicUser2.Id))

		after, appErr := th.App.GetUser(th.Context, th.BasicUser2.Id)
		require.Nil(t, appErr)
		assert.Equal(t, before.UpdateAt, after.UpdateAt, "no write when nothing is set")
	})

	t.Run("start in the past is allowed", func(t *testing.T) {
		leave := newLeave()
		leave.StartAt = model.GetMillis() - scheduledLeaveDayMillis

		_, appErr := th.App.SetScheduledLeave(th.Context, th.BasicUser.Id, leave)
		require.Nil(t, appErr)
		require.Nil(t, th.App.ClearScheduledLeave(th.Context, th.BasicUser.Id))
	})

	t.Run("rejections", func(t *testing.T) {
		deactivated := th.CreateUser(t)
		_, appErr := th.App.UpdateActive(th.Context, deactivated, false)
		require.Nil(t, appErr)

		testCases := []struct {
			name    string
			modify  func(l *model.ScheduledLeave)
			errorID string
		}{
			{
				name:    "invalid model",
				modify:  func(l *model.ScheduledLeave) { l.EndAt = l.StartAt - 1 },
				errorID: "model.scheduled_leave.is_valid.end_at.app_error",
			},
			{
				name: "end already in the past",
				modify: func(l *model.ScheduledLeave) {
					l.StartAt = model.GetMillis() - 2*scheduledLeaveDayMillis
					l.EndAt = model.GetMillis() - scheduledLeaveDayMillis
				},
				errorID: "app.scheduled_leave.set.end_in_past.app_error",
			},
			{
				name:    "backup is the user themself",
				modify:  func(l *model.ScheduledLeave) { l.BackupUserId = th.BasicUser.Id },
				errorID: "app.scheduled_leave.set.backup_self.app_error",
			},
			{
				name:    "backup does not exist",
				modify:  func(l *model.ScheduledLeave) { l.BackupUserId = model.NewId() },
				errorID: "app.scheduled_leave.set.backup_invalid.app_error",
			},
			{
				name:    "backup is deactivated",
				modify:  func(l *model.ScheduledLeave) { l.BackupUserId = deactivated.Id },
				errorID: "app.scheduled_leave.set.backup_invalid.app_error",
			},
		}

		for _, tc := range testCases {
			t.Run(tc.name, func(t *testing.T) {
				leave := newLeave()
				tc.modify(leave)

				_, appErr := th.App.SetScheduledLeave(th.Context, th.BasicUser.Id, leave)
				require.NotNil(t, appErr)
				assert.Equal(t, tc.errorID, appErr.Id)
				assert.Equal(t, http.StatusBadRequest, appErr.StatusCode)

				user, getErr := th.App.GetUser(th.Context, th.BasicUser.Id)
				require.Nil(t, getErr)
				assert.Nil(t, user.GetScheduledLeave(), "nothing is saved on rejection")
			})
		}
	})

	t.Run("get active scheduled leave", func(t *testing.T) {
		leave := newLeave()
		_, appErr := th.App.SetScheduledLeave(th.Context, th.BasicUser.Id, leave)
		require.Nil(t, appErr)
		defer func() { require.Nil(t, th.App.ClearScheduledLeave(th.Context, th.BasicUser.Id)) }()

		active, appErr := th.App.GetActiveScheduledLeave(th.Context, th.BasicUser.Id, leave.StartAt-1)
		require.Nil(t, appErr)
		assert.Nil(t, active, "before start")

		active, appErr = th.App.GetActiveScheduledLeave(th.Context, th.BasicUser.Id, leave.StartAt)
		require.Nil(t, appErr)
		assert.Equal(t, leave, active, "at start")

		active, appErr = th.App.GetActiveScheduledLeave(th.Context, th.BasicUser.Id, leave.EndAt-1)
		require.Nil(t, appErr)
		assert.Equal(t, leave, active, "just before return")

		active, appErr = th.App.GetActiveScheduledLeave(th.Context, th.BasicUser.Id, leave.EndAt)
		require.Nil(t, appErr)
		assert.Nil(t, active, "at return")

		active, appErr = th.App.GetActiveScheduledLeave(th.Context, th.BasicUser2.Id, leave.StartAt)
		require.Nil(t, appErr)
		assert.Nil(t, active, "user without leave")
	})
}
