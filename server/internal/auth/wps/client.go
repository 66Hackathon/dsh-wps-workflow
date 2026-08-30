package wps

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/auth/kso1"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/config"
)

// TokenResponse is the OAuth token payload from WPS.
type TokenResponse struct {
	AccessToken      string `json:"access_token"`
	ExpiresIn        int    `json:"expires_in"`
	RefreshToken     string `json:"refresh_token"`
	RefreshExpiresIn int    `json:"refresh_expires_in"`
	TokenType        string `json:"token_type"`
	Code             int    `json:"code"`
	Msg              string `json:"msg"`
}

// Dept is a WPS department entry on the user profile.
type Dept struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	ParentID string `json:"parent_id"`
}

// UserInfo mirrors GET /v7/users/current → data.
type UserInfo struct {
	ID         string `json:"id"`
	AliasName  string `json:"alias_name"`
	LoginName  string `json:"login_name"`
	NickName   string `json:"nick_name"`
	UserName   string `json:"user_name"`
	Name       string `json:"name"`
	Avatar     string `json:"avatar"`
	Address    string `json:"address"`
	City       string `json:"city"`
	CompanyID  string `json:"company_id"`
	Country    string `json:"country"`
	DefDeptID  string `json:"def_dept_id"`
	Email      string `json:"email"`
	EmployeeID string `json:"employee_id"`
	ExUserID   string `json:"ex_user_id"`
	Gender     string `json:"gender"`
	Role       string `json:"role"`
	LeaderID   string `json:"leader_id"`
	Phone      string `json:"phone"`
	PostalCode string `json:"postal_code"`
	Province   string `json:"province"`
	Source     string `json:"source"`
	Status     string `json:"status"`
	Telephone  string `json:"telephone"`
	Title      string `json:"title"`
	WorkPlace  string `json:"work_place"`
	CTime      string `json:"ctime"`
	MTime      string `json:"mtime"`
	Depts      []Dept `json:"depts"`
	LoginMode  string `json:"login_mode"`
}

// DisplayName returns the best human-readable name from WPS profile fields.
func (u *UserInfo) DisplayName() string {
	if u == nil {
		return ""
	}
	for _, candidate := range []string{u.UserName, u.NickName, u.AliasName, u.Name} {
		if strings.TrimSpace(candidate) != "" {
			return strings.TrimSpace(candidate)
		}
	}
	return u.ID
}

// PrimaryDepartment returns department id/name from depts or def_dept_id.
func (u *UserInfo) PrimaryDepartment() (id, name string) {
	if u == nil {
		return "", ""
	}
	if len(u.Depts) > 0 {
		dept := u.Depts[0]
		return dept.ID, dept.Name
	}
	return u.DefDeptID, ""
}

// ProfileJSON returns the full profile as JSON for persistence.
func (u *UserInfo) ProfileJSON() ([]byte, error) {
	if u == nil {
		return nil, nil
	}
	return json.Marshal(u)
}

type userInfoResponse struct {
	Code int      `json:"code"`
	Msg  string   `json:"msg"`
	Data UserInfo `json:"data"`
}

// Client calls WPS OAuth and user APIs.
type Client struct {
	cfg    config.WPSOAuthConfig
	signer *kso1.Signer
	http   *http.Client
}

// NewClient builds a WPS API client from configuration.
func NewClient(cfg config.WPSOAuthConfig) *Client {
	return &Client{
		cfg:    cfg,
		signer: kso1.NewSigner(cfg.ClientID, cfg.ClientSecret),
		http: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// AuthorizeURL builds the browser redirect URL for the authorization code flow.
func (c *Client) AuthorizeURL(state string) (string, error) {
	if c.cfg.ClientID == "" || c.cfg.RedirectURI == "" {
		return "", fmt.Errorf("wps oauth: client_id and redirect_uri are required")
	}
	values := url.Values{}
	values.Set("response_type", "code")
	values.Set("client_id", c.cfg.ClientID)
	values.Set("redirect_uri", c.cfg.RedirectURI)
	values.Set("scope", c.cfg.Scope)
	if state != "" {
		values.Set("state", state)
	}
	return c.cfg.AuthURL + "?" + values.Encode(), nil
}

// ExchangeCode trades an authorization code for tokens.
func (c *Client) ExchangeCode(ctx context.Context, code string) (*TokenResponse, error) {
	if code == "" {
		return nil, fmt.Errorf("wps oauth: code is required")
	}
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("client_id", c.cfg.ClientID)
	form.Set("client_secret", c.cfg.ClientSecret)
	form.Set("code", code)
	form.Set("redirect_uri", c.cfg.RedirectURI)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("wps oauth token http %d: %s", resp.StatusCode, string(body))
	}

	var token TokenResponse
	if err := json.Unmarshal(body, &token); err != nil {
		return nil, err
	}
	if token.AccessToken == "" {
		if token.Msg != "" {
			return nil, fmt.Errorf("wps oauth token failed: %s", token.Msg)
		}
		return nil, fmt.Errorf("wps oauth token failed: empty access_token")
	}
	return &token, nil
}

// RefreshAccessToken renews an access token using a refresh token.
func (c *Client) RefreshAccessToken(ctx context.Context, refreshToken string) (*TokenResponse, error) {
	if refreshToken == "" {
		return nil, fmt.Errorf("wps oauth: refresh_token is required")
	}
	form := url.Values{}
	form.Set("grant_type", "refresh_token")
	form.Set("client_id", c.cfg.ClientID)
	form.Set("client_secret", c.cfg.ClientSecret)
	form.Set("refresh_token", refreshToken)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("wps oauth refresh http %d: %s", resp.StatusCode, string(body))
	}

	var token TokenResponse
	if err := json.Unmarshal(body, &token); err != nil {
		return nil, err
	}
	if token.AccessToken == "" {
		if token.Msg != "" {
			return nil, fmt.Errorf("wps oauth refresh failed: %s", token.Msg)
		}
		return nil, fmt.Errorf("wps oauth refresh failed: empty access_token")
	}
	return &token, nil
}

// CurrentUser loads the authenticated WPS user profile.
func (c *Client) CurrentUser(ctx context.Context, accessToken string) (*UserInfo, error) {
	if accessToken == "" {
		return nil, fmt.Errorf("wps oauth: access_token is required")
	}

	endpoint, err := url.Parse(c.cfg.UserURL)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, err
	}
	req.URL = endpoint
	req.Header.Set("Authorization", "Bearer "+accessToken)

	if c.cfg.SignatureEnabled {
		if err := c.signer.Apply(req, nil); err != nil {
			return nil, err
		}
	} else {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("wps user info http %d: %s", resp.StatusCode, string(body))
	}

	var payload userInfoResponse
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	if payload.Code != 0 {
		if payload.Msg != "" {
			return nil, fmt.Errorf("wps user info failed: %s", payload.Msg)
		}
		return nil, fmt.Errorf("wps user info failed: code %d", payload.Code)
	}
	if payload.Data.ID == "" {
		return nil, fmt.Errorf("wps user info failed: empty user id")
	}
	return &payload.Data, nil
}
