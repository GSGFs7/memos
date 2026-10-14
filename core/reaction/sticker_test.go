package reaction

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/png"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	storepb "github.com/usememos/memos/proto/gen/store"
)

func TestValidateStickers(t *testing.T) {
	var encoded bytes.Buffer
	require.NoError(t, png.Encode(&encoded, image.NewRGBA(image.Rect(0, 0, 16, 16))))
	validImage := "data:image/png;base64," + base64.StdEncoding.EncodeToString(encoded.Bytes())
	var large bytes.Buffer
	require.NoError(t, png.Encode(&large, image.NewRGBA(image.Rect(0, 0, 513, 1))))
	for _, tc := range []struct {
		name  string
		key   string
		image string
		valid bool
	}{
		{"png", "sticker:test", validImage, true},
		{"invalid key", "../file", validImage, false},
		{"svg", "sticker:test", "data:image/svg+xml;base64,PHN2Zz4=", false},
		{"mismatched mime", "sticker:test", strings.Replace(validImage, "image/png", "image/jpeg", 1), false},
		{"broken data", "sticker:test", "data:image/png;base64,broken", false},
		{"large dimensions", "sticker:test", "data:image/png;base64," + base64.StdEncoding.EncodeToString(large.Bytes()), false},
		{"oversize", "sticker:test", "data:image/png;base64," + strings.Repeat("A", 90000), false},
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
