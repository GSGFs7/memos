package api

import (
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"

	"github.com/usememos/memos/core/instancesetting"
	apipb "github.com/usememos/memos/proto/gen/api"
)

func TestReactionStickerSettingRoundTrip(t *testing.T) {
	setting := &apipb.InstanceSetting_MemoRelatedSetting{
		Reactions: []string{"👍", "sticker:wave"},
		ReactionStickers: map[string]*apipb.InstanceSetting_ReactionSticker{
			"sticker:wave": {Name: "wave.png", Image: "data:image/png;base64,test"},
		},
	}
	require.True(t, proto.Equal(setting, instancesetting.FromStore(instancesetting.ToStore(&apipb.InstanceSetting{Name: "instance/settings/MEMO_RELATED", Value: &apipb.InstanceSetting_MemoRelatedSetting_{MemoRelatedSetting: setting}})).GetMemoRelatedSetting()))
}
