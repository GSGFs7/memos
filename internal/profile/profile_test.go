package profile

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidateInstanceURL(t *testing.T) {
	cases := []struct {
		name    string
		url     string
		want    string
		wantErr bool
	}{
		{name: "empty", url: ""},
		{name: "canonical https", url: "https://memos.example.com", want: "https://memos.example.com"},
		{name: "trim spaces and trailing slash", url: "  https://memos.example.com/app/  ", want: "https://memos.example.com/app"},
		{name: "http with port", url: "http://localhost:8080/", want: "http://localhost:8080"},
		{name: "missing scheme", url: "memos.example.com", wantErr: true},
		{name: "unsupported scheme", url: "ftp://memos.example.com", wantErr: true},
		{name: "missing host", url: "https:///memos", wantErr: true},
		{name: "credentials", url: "https://user:pass@memos.example.com", wantErr: true},
		{name: "query", url: "https://memos.example.com?tenant=one", wantErr: true},
		{name: "fragment", url: "https://memos.example.com/#top", wantErr: true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			p := &Profile{Data: t.TempDir(), Driver: "sqlite", InstanceURL: c.url}
			err := p.Validate()
			if c.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			require.Equal(t, c.want, p.InstanceURL)
		})
	}
}

func TestValidateRejectsDemoWithNonSQLiteDriver(t *testing.T) {
	p := &Profile{Demo: true, Driver: "postgres", Data: t.TempDir()}
	require.ErrorContains(t, p.Validate(), "demo mode requires the sqlite database driver")
}

func TestValidateAnonymousReactionConfiguration(t *testing.T) {
	for _, tc := range []struct {
		name, siteKey, secret string
		hostnames             []string
		valid                 bool
	}{
		{"disabled", "", "", nil, true},
		{"enabled", "public", "secret", []string{"memos.example"}, true},
		{"missing secret", "public", "", []string{"memos.example"}, false},
		{"missing hostnames", "public", "secret", nil, false},
		{"wildcard hostname", "public", "secret", []string{"*.example"}, false},
		{"URL hostname", "public", "secret", []string{"https://memos.example"}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p := &Profile{Data: t.TempDir(), Driver: "sqlite", AnonymousReactionSiteKey: tc.siteKey, AnonymousReactionSecret: tc.secret, AnonymousReactionHostnames: tc.hostnames}
			err := p.Validate()
			if tc.valid {
				require.NoError(t, err)
			} else {
				require.Error(t, err)
			}
		})
	}
}

func TestValidateNormalizesAnonymousReactionConfiguration(t *testing.T) {
	p := &Profile{
		Data: t.TempDir(), Driver: "sqlite", AnonymousReactionSiteKey: " public ",
		AnonymousReactionSecret: " secret ", AnonymousReactionHostnames: []string{" MEMOS.EXAMPLE "},
	}
	require.NoError(t, p.Validate())
	require.Equal(t, "public", p.AnonymousReactionSiteKey)
	require.Equal(t, "secret", p.AnonymousReactionSecret)
	require.Equal(t, []string{"memos.example"}, p.AnonymousReactionHostnames)
}
