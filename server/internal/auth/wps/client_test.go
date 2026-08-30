package wps

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/config"
)

func TestRefreshAccessToken(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("method=%s", r.Method)
		}
		if err := r.ParseForm(); err != nil {
			t.Fatal(err)
		}
		if r.Form.Get("grant_type") != "refresh_token" {
			t.Fatalf("grant_type=%s", r.Form.Get("grant_type"))
		}
		if r.Form.Get("refresh_token") != "rt-old" {
			t.Fatalf("refresh_token=%s", r.Form.Get("refresh_token"))
		}
		_ = json.NewEncoder(w).Encode(TokenResponse{
			AccessToken:      "at-new",
			ExpiresIn:        3600,
			RefreshToken:     "rt-new",
			RefreshExpiresIn: 86400,
			TokenType:        "Bearer",
		})
	}))
	defer srv.Close()

	client := NewClient(config.WPSOAuthConfig{
		ClientID:     "app-id",
		ClientSecret: "app-secret",
		TokenURL:     srv.URL,
	})
	token, err := client.RefreshAccessToken(context.Background(), "rt-old")
	if err != nil {
		t.Fatal(err)
	}
	if token.AccessToken != "at-new" {
		t.Fatalf("access_token=%s", token.AccessToken)
	}
	if token.RefreshToken != "rt-new" {
		t.Fatalf("refresh_token=%s", token.RefreshToken)
	}
}
