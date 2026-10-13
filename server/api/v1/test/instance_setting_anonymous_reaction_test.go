package test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/encoding/protojson"

	apiv1 "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
	apiservice "github.com/usememos/memos/server/api/v1"
)

func TestAnonymousReactionAppConfiguration(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()
	admin, err := ts.CreateHostUser(ctx, "configuration-admin")
	require.NoError(t, err)
	adminCtx := ts.CreateUserContext(ctx, admin.ID)
	regular, err := ts.CreateRegularUser(ctx, "configuration-reader")
	require.NoError(t, err)
	name := "instance/settings/ANONYMOUS_REACTION"
	update := func(c *apiv1.InstanceSetting_AnonymousReactionSetting) (*apiv1.InstanceSetting, error) {
		return ts.Service.UpdateInstanceSetting(adminCtx, &apiv1.UpdateInstanceSettingRequest{Setting: &apiv1.InstanceSetting{Name: name, Value: &apiv1.InstanceSetting_AnonymousReactionSetting_{AnonymousReactionSetting: c}}})
	}
	for _, caller := range []context.Context{ctx, ts.CreateUserContext(ctx, regular.ID)} {
		_, err = ts.Service.GetInstanceSetting(caller, &apiv1.GetInstanceSettingRequest{Name: name})
		require.Contains(t, []codes.Code{codes.Unauthenticated, codes.PermissionDenied}, status.Code(err))
		_, err = ts.Service.BatchGetInstanceSettings(caller, &apiv1.BatchGetInstanceSettingsRequest{Names: []string{name}})
		require.Contains(t, []codes.Code{codes.Unauthenticated, codes.PermissionDenied}, status.Code(err))
		_, err = ts.Service.UpdateInstanceSetting(caller, &apiv1.UpdateInstanceSettingRequest{Setting: &apiv1.InstanceSetting{Name: name, Value: &apiv1.InstanceSetting_AnonymousReactionSetting_{AnonymousReactionSetting: &apiv1.InstanceSetting_AnonymousReactionSetting{}}}})
		require.Contains(t, []codes.Code{codes.Unauthenticated, codes.PermissionDenied}, status.Code(err))
	}
	_, err = update(&apiv1.InstanceSetting_AnonymousReactionSetting{Enabled: true, SiteKey: "public", Hostnames: []string{"memos.example"}})
	require.Equal(t, codes.InvalidArgument, status.Code(err), "cannot enable without secret")
	config := &apiv1.InstanceSetting_AnonymousReactionSetting{Enabled: true, SiteKey: "public", SecretKey: "private-test-secret", Hostnames: []string{" MEMOS.EXAMPLE ", "memos.example"}}
	response, err := update(config)
	require.NoError(t, err)
	require.True(t, response.GetAnonymousReactionSetting().HasSecret)
	require.Empty(t, response.GetAnonymousReactionSetting().SecretKey)
	require.Equal(t, []string{"memos.example"}, response.GetAnonymousReactionSetting().Hostnames)
	read, err := ts.Service.GetInstanceSetting(adminCtx, &apiv1.GetInstanceSettingRequest{Name: name})
	require.NoError(t, err)
	body, err := protojson.Marshal(read)
	require.NoError(t, err)
	require.NotContains(t, string(body), "private-test-secret")
	profile, err := ts.Service.GetInstanceProfile(ctx, &apiv1.GetInstanceProfileRequest{})
	require.NoError(t, err)
	require.Equal(t, "public", profile.GetAnonymousReactionChallenge().GetSiteKey())
	require.Nil(t, profile.Challenge, "saved anonymous configuration must not affect sign-in")
	config.SecretKey = ""
	config.Hostnames = []string{"other.example"}
	_, err = update(config)
	require.NoError(t, err)
	stored, err := ts.Store.GetInstanceAnonymousReactionSetting(ctx)
	require.NoError(t, err)
	require.Equal(t, "private-test-secret", stored.SecretKey, "empty secret preserves the saved credential")
	config.SiteKey = "replacement"
	_, err = update(config)
	require.Equal(t, codes.InvalidArgument, status.Code(err), "changing the widget requires its matching secret")
	config.SecretKey = "replacement-secret"
	_, err = update(config)
	require.NoError(t, err)
	profile, err = ts.Service.GetInstanceProfile(ctx, &apiv1.GetInstanceProfileRequest{})
	require.NoError(t, err)
	require.Equal(t, "replacement", profile.GetAnonymousReactionChallenge().GetSiteKey())
	// A new service reads the same persisted configuration without environment keys.
	restarted := apiservice.NewAPIV1Service(ts.Secret, ts.Profile, ts.Store)
	profile, err = restarted.GetInstanceProfile(ctx, &apiv1.GetInstanceProfileRequest{})
	require.NoError(t, err)
	require.Equal(t, "replacement", profile.GetAnonymousReactionChallenge().GetSiteKey())
	config.Enabled = false
	config.SecretKey = ""
	_, err = update(config)
	require.NoError(t, err)
	ts.Service.AnonymousReactionChallenge = &fakeChallenge{accept: "good"}
	profile, err = ts.Service.GetInstanceProfile(ctx, &apiv1.GetInstanceProfileRequest{})
	require.NoError(t, err)
	require.Nil(t, profile.AnonymousReactionChallenge, "saved disabled setting overrides fallback challenge")
	_, err = ts.Service.AddAnonymousMemoReaction(withChallengeToken(ctx, "good"), &apiv1.AddAnonymousMemoReactionRequest{Name: "memos/nonexistent", ReactionType: "👍"})
	require.Equal(t, codes.FailedPrecondition, status.Code(err))
	require.NoError(t, ts.SetInstanceAccessMode(ctx, storepb.InstanceAccessMode_INSTANCE_ACCESS_MODE_PRIVATE))
}

func TestAnonymousReactionEnvironmentDefaults(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()
	admin, err := ts.CreateHostUser(ctx, "environment-admin")
	require.NoError(t, err)
	ts.Profile.AnonymousReactionSiteKey = "env-public"
	ts.Profile.AnonymousReactionSecret = "env-secret"
	ts.Profile.AnonymousReactionHostnames = []string{"memos.example"}
	setting, err := ts.Service.GetInstanceSetting(ts.CreateUserContext(ctx, admin.ID), &apiv1.GetInstanceSettingRequest{Name: "instance/settings/ANONYMOUS_REACTION"})
	require.NoError(t, err)
	require.True(t, setting.GetAnonymousReactionSetting().Enabled)
	require.Equal(t, "env-public", setting.GetAnonymousReactionSetting().SiteKey)
	require.True(t, setting.GetAnonymousReactionSetting().HasSecret)
	require.Empty(t, setting.GetAnonymousReactionSetting().SecretKey)
	// Reading environment defaults must not insert a setting that shadows them.
	stored, err := ts.Store.GetInstanceAnonymousReactionSetting(ctx)
	require.NoError(t, err)
	require.Nil(t, stored)
}
