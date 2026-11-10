package test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

// TestMigrationAnonymousReaction covers the official baseline, the old personal
// fork, and a calendar release without anonymous reactions on every driver.
func TestMigrationAnonymousReaction(t *testing.T) {
	for _, tc := range []struct {
		name, schema string
		personal     bool
	}{
		{name: "official-0.31", schema: "0.31.8"},
		{name: "personal-0.31", schema: "0.31.9", personal: true},
		{name: "official-calendar", schema: "26.10.1"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			ts := NewTestingStore(ctx, t)
			defer ts.Close()
			user, err := createTestingHostUser(ctx, ts)
			require.NoError(t, err)
			memo, err := ts.CreateMemo(ctx, &store.Memo{UID: "migration-reaction", CreatorID: user.ID, Content: "preserve reactions", Visibility: store.Public})
			require.NoError(t, err)
			signedIn, err := ts.UpsertReaction(ctx, &store.Reaction{CreatorID: user.ID, MemoID: memo.ID, ReactionType: "👍"})
			require.NoError(t, err)
			if tc.personal {
				_, err = ts.AddAnonymousReaction(ctx, memo.ID, "👍")
				require.NoError(t, err)
				_, err = ts.AddAnonymousReaction(ctx, memo.ID, "👍")
				require.NoError(t, err)
				// The old fork stored these JSON names before the upstream
				// renumbered fields and claimed the personal enum numbers.
				for name, value := range map[string]string{
					"MEMO_RELATED":       `{"contentLengthLimit":32768,"enableDoubleClickEdit":true,"reactions":["sticker:wave"],"reactionStickers":{"sticker:wave":{"name":"wave.png","image":"data:image/png;base64,legacy"}}}`,
					"ANONYMOUS_REACTION": `{"enabled":false,"siteKey":"legacy-site","secretKey":"legacy-secret","hostnames":["memos.example"]}`,
				} {
					_, err = ts.GetDriver().UpsertInstanceSetting(ctx, &store.InstanceSetting{Name: name, Value: value})
					require.NoError(t, err)
				}
			} else {
				_, err = ts.GetDriver().GetDB().ExecContext(ctx, "ALTER TABLE reaction DROP COLUMN anonymous_count")
				require.NoError(t, err)
			}
			// Recreate the pre-index baseline on MySQL, whose CREATE INDEX is
			// deliberately not idempotent. SQLite already had the memo index.
			if tc.schema[0] == '0' && getDriverFromEnv() == "mysql" {
				_, err = ts.GetDriver().GetDB().ExecContext(ctx, "DROP INDEX idx_memo_creator_id ON memo")
				require.NoError(t, err)
				_, err = ts.GetDriver().GetDB().ExecContext(ctx, "DROP INDEX idx_attachment_creator_id ON attachment")
				require.NoError(t, err)
			}
			_, err = ts.UpsertInstanceSetting(ctx, &storepb.InstanceSetting{
				Key: storepb.InstanceSettingKey_BASIC,
				Value: &storepb.InstanceSetting_BasicSetting{BasicSetting: &storepb.InstanceBasicSetting{
					SchemaVersion: tc.schema,
				}},
			})
			require.NoError(t, err)
			for range 2 {
				require.NoError(t, ts.Migrate(ctx), "migration and subsequent restart must succeed")
			}
			setting, err := ts.GetInstanceBasicSetting(ctx)
			require.NoError(t, err)
			require.Equal(t, "26.11.1", setting.SchemaVersion)
			reaction, err := ts.GetReaction(ctx, &store.FindReaction{ID: &signedIn.ID})
			require.NoError(t, err)
			require.Equal(t, user.ID, reaction.CreatorID)
			require.Zero(t, reaction.AnonymousCount)
			anonymous, err := ts.AddAnonymousReaction(ctx, memo.ID, "👍")
			require.NoError(t, err)
			if tc.personal {
				require.Equal(t, int64(3), anonymous.AnonymousCount, "preserve the two existing additions")
				memoSetting, err := ts.GetInstanceMemoRelatedSetting(ctx)
				require.NoError(t, err)
				require.Equal(t, "data:image/png;base64,legacy", memoSetting.ReactionStickers["sticker:wave"].Image)
				anonymousSetting, err := ts.GetInstanceAnonymousReactionSetting(ctx)
				require.NoError(t, err)
				require.Equal(t, "legacy-secret", anonymousSetting.SecretKey)
				require.Equal(t, "legacy-site", anonymousSetting.SiteKey)
				require.Equal(t, []string{"memos.example"}, anonymousSetting.Hostnames)
			} else {
				require.Equal(t, int64(1), anonymous.AnonymousCount)
			}
		})
	}
}
