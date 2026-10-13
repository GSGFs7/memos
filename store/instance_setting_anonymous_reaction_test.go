package store

import (
	"testing"

	"github.com/stretchr/testify/require"

	storepb "github.com/usememos/memos/proto/gen/store"
)

func TestNormalizeAnonymousReactionSetting(t *testing.T) {
	for _, tc := range []struct {
		name    string
		setting *storepb.InstanceAnonymousReactionSetting
		valid   bool
	}{
		{"disabled", &storepb.InstanceAnonymousReactionSetting{}, true},
		{"enabled missing config", &storepb.InstanceAnonymousReactionSetting{Enabled: true}, false},
		{"valid", &storepb.InstanceAnonymousReactionSetting{Enabled: true, SiteKey: "key", SecretKey: "secret", Hostnames: []string{"memos.example"}}, true},
		{"wildcard", &storepb.InstanceAnonymousReactionSetting{Hostnames: []string{"*.example"}}, false},
		{"URL", &storepb.InstanceAnonymousReactionSetting{Hostnames: []string{"https://memos.example"}}, false},
		{"port", &storepb.InstanceAnonymousReactionSetting{Hostnames: []string{"memos.example:8080"}}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := NormalizeAnonymousReactionSetting(tc.setting)
			if tc.valid {
				require.NoError(t, err)
			} else {
				require.Error(t, err)
			}
		})
	}
}
