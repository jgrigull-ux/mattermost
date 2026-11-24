// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api4

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/mattermost/mattermost/server/public/model"
)

const scheduledLeaveDayMillis = int64(24 * 60 * 60 * 1000)

func newTestScheduledLeave(backupUserID string) *model.ScheduledLeave {
	now := model.GetMillis()
	return &model.ScheduledLeave{
		StartAt:          now + scheduledLeaveDayMillis,
		EndAt:            now + 8*scheduledLeaveDayMillis,
		Timezone:         "America/New_York",
		BackupUserId:     backupUserID,
		Note:             "Conference",
		AutoReplyEnabled: true,
		AutoReplyMessage: "At a conference, back on Monday",
	}
}

func TestScheduledLeaveSelf(t *testing.T) {
	mainHelper.Parallel(t)
	th := Setup(t).InitBasic(t)
	ctx := context.Background()
	client := th.Client

	t.Run("get without a leave returns 404", func(t *testing.T) {
		_, resp, err := client.GetScheduledLeave(ctx, th.BasicUser.Id)
		require.Error(t, err)
		CheckNotFoundStatus(t, resp)
	})

	t.Run("put, get and delete own leave", func(t *testing.T) {
		leave := newTestScheduledLeave(th.BasicUser2.Id)

		saved, resp, err := client.SetScheduledLeave(ctx, th.BasicUser.Id, leave)
		require.NoError(t, err)
		CheckOKStatus(t, resp)
		assert.Equal(t, leave, saved)

		got, _, err := client.GetScheduledLeave(ctx, th.BasicUser.Id)
		require.NoError(t, err)
		assert.Equal(t, leave, got)

		me, _, err := client.GetMe(ctx, "")
		require.NoError(t, err)
		assert.Equal(t, leave, me.GetScheduledLeave(), "leave is readable from user props")

		resp, err = client.ClearScheduledLeave(ctx, th.BasicUser.Id)
		require.NoError(t, err)
		CheckOKStatus(t, resp)

		_, resp, err = client.GetScheduledLeave(ctx, th.BasicUser.Id)
		require.Error(t, err)
		CheckNotFoundStatus(t, resp)
	})

	t.Run("me alias works", func(t *testing.T) {
		_, _, err := client.SetScheduledLeave(ctx, "me", newTestScheduledLeave(""))
		require.NoError(t, err)
		_, err = client.ClearScheduledLeave(ctx, "me")
		require.NoError(t, err)
	})

	t.Run("delete without a leave succeeds", func(t *testing.T) {
		resp, err := client.ClearScheduledLeave(ctx, th.BasicUser.Id)
		require.NoError(t, err)
		CheckOKStatus(t, resp)
	})

	t.Run("invalid input returns 400", func(t *testing.T) {
		deactivated := th.CreateUser(t)
		_, appErr := th.App.UpdateActive(th.Context, deactivated, false)
		require.Nil(t, appErr)

		testCases := []struct {
			name   string
			modify func(l *model.ScheduledLeave)
		}{
			{name: "end before start", modify: func(l *model.ScheduledLeave) { l.EndAt = l.StartAt - 1 }},
			{name: "longer than one year", modify: func(l *model.ScheduledLeave) { l.EndAt = l.StartAt + model.ScheduledLeaveMaxDurationMillis + 1 }},
			{name: "unknown backup user", modify: func(l *model.ScheduledLeave) { l.BackupUserId = model.NewId() }},
			{name: "deactivated backup user", modify: func(l *model.ScheduledLeave) { l.BackupUserId = deactivated.Id }},
			{name: "backup is self", modify: func(l *model.ScheduledLeave) { l.BackupUserId = th.BasicUser.Id }},
			{name: "end in the past", modify: func(l *model.ScheduledLeave) {
				l.StartAt = model.GetMillis() - 2*scheduledLeaveDayMillis
				l.EndAt = model.GetMillis() - scheduledLeaveDayMillis
			}},
		}
		for _, tc := range testCases {
			t.Run(tc.name, func(t *testing.T) {
				leave := newTestScheduledLeave(th.BasicUser2.Id)
				tc.modify(leave)
				_, resp, err := client.SetScheduledLeave(ctx, th.BasicUser.Id, leave)
				require.Error(t, err)
				CheckBadRequestStatus(t, resp)
			})
		}
	})

	t.Run("malformed body returns 400", func(t *testing.T) {
		resp, err := client.DoAPIPut(ctx, "/users/"+th.BasicUser.Id+"/scheduled_leave", "{not json")
		require.Error(t, err)
		CheckBadRequestStatus(t, model.BuildResponse(resp))
	})

	t.Run("patch cannot store a malformed leave", func(t *testing.T) {
		props := model.CopyStringMap(th.BasicUser.Props)
		if props == nil {
			props = model.StringMap{}
		}
		props[model.UserPropsKeyScheduledLeave] = `{"start_at":2000,"end_at":1000}`
		_, resp, err := client.PatchUser(ctx, th.BasicUser.Id, &model.UserPatch{Props: props})
		require.Error(t, err)
		CheckBadRequestStatus(t, resp)
	})
}

func TestScheduledLeavePermissions(t *testing.T) {
	mainHelper.Parallel(t)
	th := Setup(t).InitBasic(t)
	ctx := context.Background()

	t.Run("another user gets 403", func(t *testing.T) {
		th.LoginBasic2(t)
		defer th.LoginBasic(t)

		_, resp, err := th.Client.SetScheduledLeave(ctx, th.BasicUser.Id, newTestScheduledLeave(""))
		require.Error(t, err)
		CheckForbiddenStatus(t, resp)

		_, resp, err = th.Client.GetScheduledLeave(ctx, th.BasicUser.Id)
		require.Error(t, err)
		CheckForbiddenStatus(t, resp)

		resp, err = th.Client.ClearScheduledLeave(ctx, th.BasicUser.Id)
		require.Error(t, err)
		CheckForbiddenStatus(t, resp)
	})

	t.Run("system admin and local mode can manage another user's leave", func(t *testing.T) {
		th.TestForSystemAdminAndLocal(t, func(t *testing.T, client *model.Client4) {
			leave := newTestScheduledLeave(th.BasicUser2.Id)

			saved, _, err := client.SetScheduledLeave(ctx, th.BasicUser.Id, leave)
			require.NoError(t, err)
			assert.Equal(t, leave, saved)

			got, _, err := client.GetScheduledLeave(ctx, th.BasicUser.Id)
			require.NoError(t, err)
			assert.Equal(t, leave, got)

			_, err = client.ClearScheduledLeave(ctx, th.BasicUser.Id)
			require.NoError(t, err)
		})
	})

	t.Run("user with edit_others_users can manage a regular user's leave but not an admin's", func(t *testing.T) {
		th.LoginSystemManager(t)
		client := th.SystemManagerClient

		_, _, err := client.SetScheduledLeave(ctx, th.BasicUser.Id, newTestScheduledLeave(""))
		require.NoError(t, err)
		_, err = client.ClearScheduledLeave(ctx, th.BasicUser.Id)
		require.NoError(t, err)

		_, resp, err := client.SetScheduledLeave(ctx, th.SystemAdminUser.Id, newTestScheduledLeave(""))
		require.Error(t, err)
		CheckForbiddenStatus(t, resp)
	})

	t.Run("unauthenticated gets 401", func(t *testing.T) {
		client := th.CreateClient()
		_, resp, err := client.GetScheduledLeave(ctx, th.BasicUser.Id)
		require.Error(t, err)
		CheckUnauthorizedStatus(t, resp)
	})
}

func TestScheduledLeaveWebsocketEvent(t *testing.T) {
	mainHelper.Parallel(t)
	th := Setup(t).InitBasic(t)
	ctx := context.Background()

	observer := th.CreateConnectedWebSocketClientWithClient(t, th.SystemAdminClient)

	assertUserUpdatedWithLeave := func(t *testing.T, expected *model.ScheduledLeave) {
		assertExpectedWebsocketEvent(t, observer, model.WebsocketEventUserUpdated, func(event *model.WebSocketEvent) {
			eventUser, ok := event.GetData()["user"].(*model.User)
			require.True(t, ok, "expected user")
			assert.Equal(t, th.BasicUser.Id, eventUser.Id)
			assert.Equal(t, expected, eventUser.GetScheduledLeave())
		})
	}

	leave := newTestScheduledLeave(th.BasicUser2.Id)
	_, _, err := th.Client.SetScheduledLeave(ctx, th.BasicUser.Id, leave)
	require.NoError(t, err)
	assertUserUpdatedWithLeave(t, leave)

	_, err = th.Client.ClearScheduledLeave(ctx, th.BasicUser.Id)
	require.NoError(t, err)
	assertUserUpdatedWithLeave(t, nil)
}
