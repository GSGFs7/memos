// Package turnstile verifies Cloudflare proof-of-humanity tokens with Siteverify.
package turnstile

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"

	"github.com/pkg/errors"
)

// Client verifies tokens for one widget, action and exact hostname allowlist.
type Client struct {
	siteKey    string
	secret     string
	hostnames  []string
	action     string
	httpClient *http.Client
	endpoint   string
}

// New creates a verifier with a bounded request timeout.
func New(siteKey, secret string, hostnames []string, action string) *Client {
	return &Client{siteKey: siteKey, secret: secret, hostnames: slices.Clone(hostnames), action: action,
		httpClient: &http.Client{Timeout: 10 * time.Second}, endpoint: "https://challenges.cloudflare.com/turnstile/v0/siteverify"}
}

// SiteKey returns the public widget key.
func (c *Client) SiteKey() string { return c.siteKey }

// Verify rejects invalid, reused or expired tokens and mismatched hostnames/actions.
func (c *Client) Verify(ctx context.Context, token, clientIP string) error {
	if token == "" || len(token) > 2048 || c.secret == "" || len(c.hostnames) == 0 || c.action == "" {
		return errors.New("invalid Turnstile verification input")
	}
	form := url.Values{"secret": {c.secret}, "response": {token}}
	if clientIP != "" {
		form.Set("remoteip", clientIP)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return errors.Wrap(err, "failed to create Turnstile verification request")
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := c.httpClient.Do(req)
	if err != nil {
		return errors.Wrap(err, "Turnstile verification unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return errors.New("Turnstile verification returned an unsuccessful status")
	}
	var result struct {
		Success  bool   `json:"success"`
		Hostname string `json:"hostname"`
		Action   string `json:"action"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 16<<10)).Decode(&result); err != nil {
		return errors.Wrap(err, "failed to decode Turnstile verification")
	}
	if !result.Success || result.Action != c.action || !slices.Contains(c.hostnames, result.Hostname) {
		return errors.New("Turnstile verification rejected")
	}
	return nil
}
