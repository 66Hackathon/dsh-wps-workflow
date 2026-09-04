package wps

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const tenantTokenSkew = 60 * time.Second

type tenantTokenCache struct {
	mu        sync.Mutex
	token     string
	expiresAt time.Time
}

func (c *tenantTokenCache) get() (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.token == "" || time.Now().Add(tenantTokenSkew).After(c.expiresAt) {
		return "", false
	}
	return c.token, true
}

func (c *tenantTokenCache) set(token string, expiresInSec int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if expiresInSec <= 0 {
		expiresInSec = 7200
	}
	c.token = token
	c.expiresAt = time.Now().Add(time.Duration(expiresInSec) * time.Second)
}

// TenantAccessToken returns the enterprise app access token (client_credentials).
// IM chat APIs require app authorization rather than user OAuth tokens.
func (c *Client) TenantAccessToken(ctx context.Context) (string, error) {
	if token, ok := c.tenantCache.get(); ok {
		return token, nil
	}
	if c.cfg.ClientID == "" || c.cfg.ClientSecret == "" {
		return "", fmt.Errorf("wps oauth: client_id and client_secret are required for app token")
	}

	form := url.Values{}
	form.Set("grant_type", "client_credentials")
	form.Set("client_id", c.cfg.ClientID)
	form.Set("client_secret", c.cfg.ClientSecret)

	tokenURL := strings.TrimSpace(c.cfg.TokenURL)
	if tokenURL == "" {
		tokenURL = c.apiBase() + "/oauth2/token"
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("wps app token http %d: %s", resp.StatusCode, string(body))
	}

	var token TokenResponse
	if err := json.Unmarshal(body, &token); err != nil {
		return "", err
	}
	if token.AccessToken == "" {
		if token.Msg != "" {
			return "", fmt.Errorf("wps app token failed: %s", token.Msg)
		}
		return "", fmt.Errorf("wps app token failed: empty access_token")
	}

	c.tenantCache.set(token.AccessToken, tokenExpiresSeconds(&token))
	return token.AccessToken, nil
}

func tokenExpiresSeconds(token *TokenResponse) int {
	if token == nil || token.ExpiresIn <= 0 {
		return 7200
	}
	return token.ExpiresIn
}

// ValidWPSUserID reports whether an id looks like a real WPS enterprise user id.
func ValidWPSUserID(id string) bool {
	return isValidWPSUserID(id)
}

func isValidWPSUserID(id string) bool {
	id = strings.TrimSpace(id)
	if id == "" {
		return false
	}
	if strings.HasPrefix(id, "demo-wps-user-") {
		return false
	}
	return true
}

// FilterWPSUserIDs removes empty and demo placeholder user ids.
func FilterWPSUserIDs(ids []string) []string {
	return filterWPSUserIDs(ids)
}

func filterWPSUserIDs(ids []string) []string {
	out := make([]string, 0, len(ids))
	seen := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if !isValidWPSUserID(id) {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}
