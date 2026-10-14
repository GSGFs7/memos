// Package reaction validates image stickers used by memo reactions.
package reaction

import (
	"bytes"
	"encoding/base64"
	"image"
	_ "image/gif" // Register supported image formats.
	_ "image/jpeg"
	_ "image/png"
	"regexp"
	"strings"

	"github.com/pkg/errors"
	_ "golang.org/x/image/webp"

	storepb "github.com/usememos/memos/proto/gen/store"
)

const maxStickerBytes = 64 * 1024

var stickerKey = regexp.MustCompile(`^sticker:[a-zA-Z0-9-]{1,64}$`)

// ValidateStickers checks image content, size and reaction references.
func ValidateStickers(setting *storepb.InstanceMemoRelatedSetting) error {
	if len(setting.ReactionStickers) > 32 {
		return errors.New("at most 32 reaction stickers are allowed")
	}
	total := 0
	for key, sticker := range setting.ReactionStickers {
		if !stickerKey.MatchString(key) || strings.TrimSpace(sticker.GetName()) == "" || len(sticker.GetName()) > 128 {
			return errors.New("invalid sticker key or name")
		}
		uri := sticker.GetImage()
		if len(uri) > base64.StdEncoding.EncodedLen(maxStickerBytes)+32 {
			return errors.New("sticker image exceeds 64 KB")
		}
		header, encoded, ok := strings.Cut(uri, ",")
		formats := map[string]string{"data:image/png;base64": "png", "data:image/jpeg;base64": "jpeg", "data:image/gif;base64": "gif", "data:image/webp;base64": "webp"}
		format, allowed := formats[header]
		if !ok || !allowed {
			return errors.New("unsupported sticker image type")
		}
		data, err := base64.StdEncoding.Strict().DecodeString(encoded)
		if err != nil || len(data) == 0 || len(data) > maxStickerBytes {
			return errors.New("invalid sticker image data")
		}
		config, decodedFormat, err := image.DecodeConfig(bytes.NewReader(data))
		if err != nil || decodedFormat != format || config.Width < 1 || config.Height < 1 || config.Width > 512 || config.Height > 512 {
			return errors.New("sticker must be a valid image no larger than 512 by 512 pixels")
		}
		if _, _, err := image.Decode(bytes.NewReader(data)); err != nil {
			return errors.Wrap(err, "invalid sticker image")
		}
		total += len(data)
		if total > 1024*1024 {
			return errors.New("total sticker image size exceeds 1 MB")
		}
	}
	for _, key := range setting.Reactions {
		if strings.HasPrefix(key, "sticker:") && setting.ReactionStickers[key] == nil {
			return errors.New("reaction references an unknown sticker")
		}
	}
	return nil
}
