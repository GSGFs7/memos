package turnstile

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestVerify(t *testing.T) {
	for _, tc := range []struct {
		name, body string
		code       int
		allowed    bool
	}{
		{"valid", `{"success":true,"hostname":"memos.example","action":"anonymous_reaction"}`, 200, true},
		{"rejected", `{"success":false}`, 200, false},
		{"wrong host", `{"success":true,"hostname":"attacker.example","action":"anonymous_reaction"}`, 200, false},
		{"wrong action", `{"success":true,"hostname":"memos.example","action":"signup"}`, 200, false},
		{"malformed", `not json`, 200, false},
		{"unavailable", `{"success":true,"hostname":"memos.example","action":"anonymous_reaction"}`, 503, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				require.Equal(t, http.MethodPost, r.Method)
				require.NoError(t, r.ParseForm())
				require.Equal(t, "secret", r.Form.Get("secret"))
				require.Equal(t, "proof", r.Form.Get("response"))
				require.Equal(t, "203.0.113.1", r.Form.Get("remoteip"))
				w.WriteHeader(tc.code)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer srv.Close()
			client := New("public", "secret", []string{"memos.example"}, "anonymous_reaction")
			client.endpoint = srv.URL
			err := client.Verify(context.Background(), "proof", "203.0.113.1")
			if tc.allowed {
				require.NoError(t, err)
			} else {
				require.Error(t, err)
			}
		})
	}
}
