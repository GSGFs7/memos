package store

import (
	"context"
	"strings"

	"github.com/pkg/errors"

	storepb "github.com/usememos/memos/proto/gen/store"
)

// GetInstanceAnonymousReactionSetting returns the saved setting, or nil if unconfigured.
// Nil permits the transport to use the deployment's environment configuration.
func (s *Store) GetInstanceAnonymousReactionSetting(ctx context.Context) (*storepb.InstanceAnonymousReactionSetting, error) {
	setting, err := s.GetInstanceSetting(ctx, &FindInstanceSetting{Name: storepb.InstanceSettingKey_ANONYMOUS_REACTION.String()})
	if err != nil {
		return nil, errors.Wrap(err, "failed to get anonymous reaction setting")
	}
	if setting == nil {
		return nil, nil
	}
	return setting.GetAnonymousReactionSetting(), nil
}

// NormalizeAnonymousReactionSetting validates and normalizes anonymous reaction configuration.
func NormalizeAnonymousReactionSetting(setting *storepb.InstanceAnonymousReactionSetting) error {
	if setting == nil {
		return errors.New("anonymous reaction setting is required")
	}
	setting.SiteKey = strings.TrimSpace(setting.SiteKey)
	setting.SecretKey = strings.TrimSpace(setting.SecretKey)
	if len(setting.SiteKey) > 256 || len(setting.SecretKey) > 256 || len(setting.Hostnames) > 100 {
		return errors.New("anonymous reaction configuration is too large")
	}
	hostnames := make([]string, 0, len(setting.Hostnames))
	seen := map[string]bool{}
	for _, hostname := range setting.Hostnames {
		hostname = strings.ToLower(strings.TrimSpace(hostname))
		if hostname == "" || len(hostname) > 253 || strings.ContainsAny(hostname, "/:*,@?#[] \t\r\n") {
			return errors.New("hostnames must be exact domain names without schemes, ports or wildcards")
		}
		if !seen[hostname] {
			hostnames = append(hostnames, hostname)
			seen[hostname] = true
		}
	}
	setting.Hostnames = hostnames
	if setting.Enabled && (setting.SiteKey == "" || setting.SecretKey == "" || len(setting.Hostnames) == 0) {
		return errors.New("enabled anonymous reactions require a site key, secret key and hostnames")
	}
	return nil
}
