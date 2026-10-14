package v1

import (
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
)

func TestReactionStickerSettingRoundTrip(t *testing.T) {
	setting := &v1pb.InstanceSetting_MemoRelatedSetting{
		ContentLengthLimit: 8192,
		Reactions:          []string{"👍", "sticker:wave"},
		ReactionStickers: map[string]*v1pb.InstanceSetting_ReactionSticker{
			"sticker:wave": {Name: "wave.png", Image: "data:image/png;base64,test"},
		},
	}
	require.True(t, proto.Equal(setting, convertInstanceMemoRelatedSettingFromStore(convertInstanceMemoRelatedSettingToStore(setting))))
}
