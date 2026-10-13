package v1

import (
	"context"

	"github.com/usememos/memos/internal/ratelimit"
	"github.com/usememos/memos/internal/turnstile"
	storepb "github.com/usememos/memos/proto/gen/store"
)

type anonymousReactionVerifier struct{ client *turnstile.Client }

func (*anonymousReactionVerifier) Provider() string  { return "turnstile" }
func (v *anonymousReactionVerifier) SiteKey() string { return v.client.SiteKey() }
func (v *anonymousReactionVerifier) Verify(ctx context.Context, _ ratelimit.Scope, token, clientIP string) error {
	return v.client.Verify(ctx, token, clientIP)
}

// effectiveAnonymousReactionSetting prefers saved app configuration over environment defaults.
func (s *APIV1Service) effectiveAnonymousReactionSetting(ctx context.Context) (*storepb.InstanceAnonymousReactionSetting, error) {
	setting, err := s.Store.GetInstanceAnonymousReactionSetting(ctx)
	if err != nil {
		return nil, err
	}
	if setting != nil {
		return setting, nil
	}
	return &storepb.InstanceAnonymousReactionSetting{
		Enabled:   s.Profile.AnonymousReactionSiteKey != "",
		SiteKey:   s.Profile.AnonymousReactionSiteKey,
		SecretKey: s.Profile.AnonymousReactionSecret,
		Hostnames: append([]string(nil), s.Profile.AnonymousReactionHostnames...),
	}, nil
}

func (s *APIV1Service) resolveAnonymousReactionChallenge(ctx context.Context) (ratelimit.Challenge, error) {
	setting, err := s.Store.GetInstanceAnonymousReactionSetting(ctx)
	if err != nil {
		return nil, err
	}
	if setting == nil {
		return s.AnonymousReactionChallenge, nil
	}
	if !setting.Enabled {
		return nil, nil
	}
	// Read the current setting for every request. Cached settings are replaced atomically on save.
	return &anonymousReactionVerifier{client: turnstile.New(setting.SiteKey, setting.SecretKey, setting.Hostnames, "anonymous_reaction")}, nil
}
