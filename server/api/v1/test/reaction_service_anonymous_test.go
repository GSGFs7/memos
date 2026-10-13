package test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/encoding/protojson"

	"github.com/usememos/memos/internal/ratelimit"
	apiv1 "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

func TestAnonymousMemoReactions(t *testing.T) {
	ctx := withClientIP(context.Background(), "203.0.113.1")
	ts := NewTestService(t)
	defer ts.Cleanup()
	user, err := ts.CreateRegularUser(ctx, "anonymous-memo-owner")
	require.NoError(t, err)
	userCtx := ts.CreateUserContext(ctx, user.ID)
	memo, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{MemoId: "anonymous-test-memo", Memo: &apiv1.Memo{Content: "public", Visibility: apiv1.Visibility_PUBLIC}})
	require.NoError(t, err)
	req := &apiv1.AddAnonymousMemoReactionRequest{Name: memo.Name, ReactionType: "👍"}
	_, err = ts.Service.AddAnonymousMemoReaction(ctx, req)
	require.Equal(t, codes.FailedPrecondition, status.Code(err))
	ts.Service.AnonymousReactionChallenge = &fakeChallenge{accept: "good"}
	_, err = ts.Service.AddAnonymousMemoReaction(ctx, req)
	require.Equal(t, codes.FailedPrecondition, status.Code(err))
	_, err = ts.Service.AddAnonymousMemoReaction(withChallengeToken(ctx, "bad"), req)
	require.Equal(t, codes.FailedPrecondition, status.Code(err))
	id := parseMemoIDFromNameForTest(t, ts, memo.Name)
	reactions, err := ts.Store.ListReactions(ctx, &store.FindReaction{MemoID: &id})
	require.NoError(t, err)
	require.Empty(t, reactions)
	for i := int64(1); i <= 2; i++ {
		reaction, err := ts.Service.AddAnonymousMemoReaction(withChallengeToken(ctx, "good"), req)
		require.NoError(t, err)
		require.Equal(t, i, reaction.AnonymousCount)
		require.Empty(t, reaction.Creator)
	}
	// A user's reaction is still separate and removable.
	signedIn, err := ts.Service.UpsertMemoReaction(userCtx, &apiv1.UpsertMemoReactionRequest{Name: memo.Name, Reaction: &apiv1.Reaction{ReactionType: "👍"}})
	require.NoError(t, err)
	require.Zero(t, signedIn.AnonymousCount)
	fetched, err := ts.Service.GetMemo(ctx, &apiv1.GetMemoRequest{Name: memo.Name})
	require.NoError(t, err)
	require.Len(t, fetched.Reactions, 2)
	_, err = ts.Service.DeleteMemoReaction(userCtx, &apiv1.DeleteMemoReactionRequest{Name: fetched.Reactions[0].Name})
	require.Equal(t, codes.PermissionDenied, status.Code(err), "ordinary users cannot withdraw anonymous counts")
	_, err = ts.Service.DeleteMemoReaction(ctx, &apiv1.DeleteMemoReactionRequest{Name: fetched.Reactions[0].Name})
	require.Equal(t, codes.Unauthenticated, status.Code(err))
	_, err = ts.Service.DeleteMemoReaction(userCtx, &apiv1.DeleteMemoReactionRequest{Name: signedIn.Name})
	require.NoError(t, err)
	profile, err := ts.Service.GetInstanceProfile(ctx, &apiv1.GetInstanceProfileRequest{})
	require.NoError(t, err)
	require.NotNil(t, profile.AnonymousReactionChallenge)
	require.Nil(t, profile.Challenge, "anonymous challenge must not affect sign-in")
	req.ReactionType = "unconfigured"
	_, err = ts.Service.AddAnonymousMemoReaction(withChallengeToken(ctx, "good"), req)
	require.Equal(t, codes.InvalidArgument, status.Code(err))
	req.ReactionType = "👍"
	ts.Service.RateLimiter = ratelimit.NewMemoryLimiter(ratelimit.Policy{ratelimit.ScopeAnonymousReactionIP: {Limit: 1, Window: time.Minute}})
	_, err = ts.Service.AddAnonymousMemoReaction(withChallengeToken(ctx, "good"), req)
	require.NoError(t, err)
	_, err = ts.Service.AddAnonymousMemoReaction(withChallengeToken(ctx, "good"), req)
	require.Equal(t, codes.ResourceExhausted, status.Code(err))
	ts.Service.RateLimiter = nil
	require.NoError(t, ts.SetInstanceAccessMode(ctx, storepb.InstanceAccessMode_INSTANCE_ACCESS_MODE_PRIVATE))
	_, err = ts.Service.AddAnonymousMemoReaction(withChallengeToken(userCtx, "good"), req)
	require.Equal(t, codes.PermissionDenied, status.Code(err), "authenticated caller cannot bypass private-instance gate")
	profile, err = ts.Service.GetInstanceProfile(ctx, &apiv1.GetInstanceProfileRequest{})
	require.NoError(t, err)
	require.Nil(t, profile.AnonymousReactionChallenge)
}

func TestAnonymousMemoReactionAudience(t *testing.T) {
	for _, visibility := range []apiv1.Visibility{apiv1.Visibility_PRIVATE, apiv1.Visibility_PROTECTED} {
		t.Run(visibility.String(), func(t *testing.T) {
			ctx := context.Background()
			ts := NewTestService(t)
			defer ts.Cleanup()
			ts.Service.AnonymousReactionChallenge = &fakeChallenge{accept: "good"}
			user, err := ts.CreateRegularUser(ctx, "owner")
			require.NoError(t, err)
			memo, err := ts.Service.CreateMemo(ts.CreateUserContext(ctx, user.ID), &apiv1.CreateMemoRequest{Memo: &apiv1.Memo{Content: "hidden", Visibility: visibility}})
			require.NoError(t, err)
			_, err = ts.Service.AddAnonymousMemoReaction(withChallengeToken(ctx, "good"), &apiv1.AddAnonymousMemoReactionRequest{Name: memo.Name, ReactionType: "👍"})
			require.Equal(t, codes.PermissionDenied, status.Code(err))
		})
	}
}

func TestAnonymousReactionTransports(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()
	ts.Service.AnonymousReactionChallenge = &fakeChallenge{accept: "good"}
	user, err := ts.CreateRegularUser(ctx, "transport-owner")
	require.NoError(t, err)
	memo, err := ts.Service.CreateMemo(ts.CreateUserContext(ctx, user.ID), &apiv1.CreateMemoRequest{MemoId: "anonymous-transport", Memo: &apiv1.Memo{Content: "public", Visibility: apiv1.Visibility_PUBLIC}})
	require.NoError(t, err)
	e := echo.New()
	require.NoError(t, ts.Service.RegisterGateway(ctx, e))
	data, err := protojson.Marshal(&apiv1.AddAnonymousMemoReactionRequest{Name: memo.Name, ReactionType: "👍"})
	require.NoError(t, err)
	for _, path := range []string{"/api/v1/" + memo.Name + "/reactions:anonymous", "/memos.api.v1.MemoService/AddAnonymousMemoReaction"} {
		t.Run(path, func(t *testing.T) {
			call := func(token string) *httptest.ResponseRecorder {
				req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(data))
				req.Header.Set("Content-Type", "application/json")
				if token != "" {
					req.Header.Set("Challenge-Token", token)
				}
				rec := httptest.NewRecorder()
				e.ServeHTTP(rec, req)
				return rec
			}
			require.NotEqual(t, http.StatusOK, call("").Code)
			rec := call("good")
			require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
			reaction := &apiv1.Reaction{}
			require.NoError(t, protojson.Unmarshal(rec.Body.Bytes(), reaction))
			require.Positive(t, reaction.AnonymousCount)
			require.NoError(t, ts.SetInstanceAccessMode(ctx, storepb.InstanceAccessMode_INSTANCE_ACCESS_MODE_PRIVATE))
			require.Equal(t, http.StatusUnauthorized, call("good").Code)
			require.NoError(t, ts.SetInstanceAccessMode(ctx, storepb.InstanceAccessMode_INSTANCE_ACCESS_MODE_PUBLIC))
		})
	}
}
