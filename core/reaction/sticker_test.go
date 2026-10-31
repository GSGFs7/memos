package reaction

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/png"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	storepb "github.com/usememos/memos/proto/gen/store"
)

func TestValidateStickers(t *testing.T) {
	var encoded bytes.Buffer
	require.NoError(t, png.Encode(&encoded, image.NewRGBA(image.Rect(0, 0, 16, 16))))
	validImage := "data:image/png;base64," + base64.StdEncoding.EncodeToString(encoded.Bytes())
	imageWithSize := func(size int) string {
		data := append([]byte(nil), encoded.Bytes()...)
		data = append(data, make([]byte, size-len(data))...)
		return "data:image/png;base64," + base64.StdEncoding.EncodeToString(data)
	}
	var large bytes.Buffer
	require.NoError(t, png.Encode(&large, image.NewRGBA(image.Rect(0, 0, 513, 1))))
	for _, tc := range []struct {
		name  string
		key   string
		image string
		valid bool
	}{
		{"png", "sticker:test", validImage, true},
		{"above former limit", "sticker:test", imageWithSize(64*1024 + 1), true},
		{"at size limit", "sticker:test", imageWithSize(maxStickerBytes), true},
		{"above size limit", "sticker:test", imageWithSize(maxStickerBytes + 1), false},
		{"invalid key", "../file", validImage, false},
		{"svg", "sticker:test", "data:image/svg+xml;base64,PHN2Zz4=", false},
		{"mismatched mime", "sticker:test", strings.Replace(validImage, "image/png", "image/jpeg", 1), false},
		{"broken data", "sticker:test", "data:image/png;base64,broken", false},
		{"large dimensions", "sticker:test", "data:image/png;base64," + base64.StdEncoding.EncodeToString(large.Bytes()), false},
		{"oversize", "sticker:test", "data:image/png;base64," + strings.Repeat("A", base64.StdEncoding.EncodedLen(maxStickerBytes+1)), false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			setting := &storepb.InstanceMemoRelatedSetting{
				Reactions:        []string{tc.key},
				ReactionStickers: map[string]*storepb.ReactionSticker{tc.key: {Name: "wave.png", Image: tc.image}},
			}
			err := ValidateStickers(setting)
			if tc.valid {
				require.NoError(t, err)
				setting.Reactions = []string{"👍"}
				require.NoError(t, ValidateStickers(setting), "removed stickers remain available for history")
			} else {
				require.Error(t, err)
			}
		})
	}
	require.Error(t, ValidateStickers(&storepb.InstanceMemoRelatedSetting{Reactions: []string{"sticker:missing"}}))
}

func TestValidateStickersWithoutAggregateLimits(t *testing.T) {
	var encoded bytes.Buffer
	require.NoError(t, png.Encode(&encoded, image.NewRGBA(image.Rect(0, 0, 16, 16))))
	// Valid PNGs can have trailing bytes; keep each image under 128 KB while
	// exceeding both former limits with the full collection.
	data := append(encoded.Bytes(), make([]byte, 32*1024)...)
	require.Less(t, len(data), maxStickerBytes)
	uri := "data:image/png;base64," + base64.StdEncoding.EncodeToString(data)
	setting := &storepb.InstanceMemoRelatedSetting{ReactionStickers: make(map[string]*storepb.ReactionSticker)}
	for i := range 40 {
		key := "sticker:" + strconv.Itoa(i)
		setting.Reactions = append(setting.Reactions, key)
		setting.ReactionStickers[key] = &storepb.ReactionSticker{Name: "wave.png", Image: uri}
	}
	require.Greater(t, len(data)*len(setting.ReactionStickers), 1024*1024)
	require.NoError(t, ValidateStickers(setting))
}
