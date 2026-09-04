package handler

import (
	"github.com/gin-gonic/gin"

	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"go.uber.org/zap"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/auth/session"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/auth/wps"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/config"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/repository"
)

type authContextKey struct{}

const systemSessionTTL = 7 * 24 * 3600

// AuthDeps groups auth handler dependencies.
type AuthDeps struct {
	Config   config.Config
	Log      *zap.Logger
	WPS      *wps.Client
	Sessions *session.Manager
	Repo     *repository.Repository
}

// AuthHandler serves WPS OAuth login endpoints.
type AuthHandler struct {
	deps AuthDeps
}

// NewAuthHandler builds auth HTTP handlers.
func NewAuthHandler(deps AuthDeps) *AuthHandler {
	return &AuthHandler{deps: deps}
}

// HandleLogin returns OAuth parameters for the frontend to start authorization.
func (h *AuthHandler) HandleLogin(c *gin.Context) {
	if !h.deps.Config.OAuthConfigured() {
		writeJSON(c, http.StatusServiceUnavailable, map[string]string{
			"error":   "oauth_not_configured",
			"message": "WPS OAuth 未配置，请在 server/.env 填入 WPS_OAUTH_CLIENT_ID、WPS_OAUTH_CLIENT_SECRET 和 WPS_OAUTH_REDIRECT_URI",
		})
		return
	}

	returnTo := resolveFrontendReturnTo(c, h.deps.Config.Auth.FrontendRedirectURL)
	state, err := h.deps.Sessions.CreateState(returnTo)
	if err != nil {
		writeJSON(c, http.StatusInternalServerError, map[string]string{
			"error":   "state_create_failed",
			"message": err.Error(),
		})
		return
	}

	authURL, err := h.deps.WPS.AuthorizeURL(state)
	if err != nil {
		writeJSON(c, http.StatusInternalServerError, map[string]string{
			"error":   "authorize_url_failed",
			"message": err.Error(),
		})
		return
	}

	writeJSON(c, http.StatusOK, map[string]string{
		"client_id":    h.deps.Config.WPS.ClientID,
		"state":        state,
		"redirect_url": authURL,
		"return_to":    returnTo,
	})
}

// HandleCallback completes OAuth, persists the user, and redirects with a system token.
func (h *AuthHandler) HandleCallback(c *gin.Context) {
	if !h.deps.Config.OAuthConfigured() {
		h.redirectWithError(c, "", "WPS OAuth 未配置")
		return
	}

	if errCode := c.Query("error"); errCode != "" {
		desc := c.Query("error_description")
		h.redirectWithError(c, "", fmt.Sprintf("%s: %s", errCode, desc))
		return
	}

	code := c.Query("code")
	state := c.Query("state")
	if code == "" {
		h.redirectWithError(c, "", "missing authorization code")
		return
	}
	returnTo, ok := h.deps.Sessions.ConsumeState(state)
	if state == "" || !ok {
		writeJSON(c, http.StatusBadRequest, map[string]string{
			"error":   "invalid_state",
			"message": "OAuth state mismatch or expired",
		})
		return
	}
	frontendBase := h.frontendRedirectURL(returnTo)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	token, err := h.deps.WPS.ExchangeCode(ctx, code)
	if err != nil {
		h.redirectWithError(c, frontendBase, "token exchange failed: "+err.Error())
		return
	}

	profile, err := h.deps.WPS.CurrentUser(ctx, token.AccessToken)
	if err != nil {
		h.redirectWithError(c, frontendBase, "load user profile failed: "+err.Error())
		return
	}

	user, err := h.deps.Repo.UpsertWPSUser(ctx, profile, token)
	if err != nil {
		h.redirectWithError(c, frontendBase, "persist user failed: "+err.Error())
		return
	}

	sessionID, _, err := h.deps.Sessions.CreateSession(repositoryUserToSessionUser(user), systemSessionTTL)
	if err != nil {
		h.redirectWithError(c, frontendBase, "create session failed: "+err.Error())
		return
	}

	redirectURL := frontendBase + "?" + url.Values{"token": {sessionID}}.Encode()
	c.Redirect(http.StatusFound, redirectURL)
}

func (h *AuthHandler) HandleMe(c *gin.Context) {
	sessionID := h.sessionIDFromRequest(c)
	if sessionID == "" {
		writeJSON(c, http.StatusUnauthorized, map[string]string{
			"error":   "unauthorized",
			"message": "login required",
		})
		return
	}

	record, ok := h.loadSession(c.Request.Context(), sessionID)
	if !ok {
		writeJSON(c, http.StatusUnauthorized, map[string]string{
			"error":   "unauthorized",
			"message": "session expired",
		})
		return
	}

	user := record.User
	if h.deps.Repo != nil {
		if fresh, err := h.deps.Repo.GetUserByID(c.Request.Context(), record.User.ID); err == nil {
			user = repositoryUserToSessionUser(fresh)
		}
	}

	writeJSON(c, http.StatusOK, user)
}

func (h *AuthHandler) HandleAuthConfig(c *gin.Context) {
	writeJSON(c, http.StatusOK, map[string]any{
		"oauth_configured": h.deps.Config.OAuthConfigured(),
		"dev_mode":         h.deps.Config.DevMode,
		"login_path":       "/api/auth/login",
		"redirect_uri":     h.deps.Config.WPS.RedirectURI,
		"frontend_url":     h.deps.Config.Auth.FrontendRedirectURL,
	})
}

func (h *AuthHandler) HandleAuthStatus(c *gin.Context) {
	sessionID := h.sessionIDFromRequest(c)
	if sessionID == "" {
		writeJSON(c, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	record, ok := h.loadSession(c.Request.Context(), sessionID)
	if !ok {
		writeJSON(c, http.StatusUnauthorized, map[string]string{"error": "session_expired"})
		return
	}

	status := map[string]any{
		"authenticated":          true,
		"provider":               "wps_oauth",
		"session_expires_at":     record.ExpiresAt.UTC().Format(time.RFC3339),
		"auto_renew_enabled":     false,
		"wps_access_expires_at":  "",
		"wps_refresh_expires_at": "",
	}

	if h.deps.Repo != nil {
		tokens, err := h.deps.Repo.GetUserWPSTokens(c.Request.Context(), record.User.ID)
		if err == nil {
			status["auto_renew_enabled"] = tokens.RefreshToken != ""
			if !tokens.ExpiresAt.IsZero() {
				status["wps_access_expires_at"] = tokens.ExpiresAt.UTC().Format(time.RFC3339)
			}
			if !tokens.RefreshExpiresAt.IsZero() {
				status["wps_refresh_expires_at"] = tokens.RefreshExpiresAt.UTC().Format(time.RFC3339)
			}
		}
	}

	writeJSON(c, http.StatusOK, status)
}

func (h *AuthHandler) HandleLogout(c *gin.Context) {
	if sessionID := h.sessionIDFromRequest(c); sessionID != "" {
		h.deps.Sessions.Delete(sessionID)
	}
	writeJSON(c, http.StatusOK, map[string]string{"status": "ok"})
}

// HandleDevLogin creates a session for a seed user (development only).
func (h *AuthHandler) HandleDevLogin(c *gin.Context) {
	if !h.deps.Config.DevMode {
		writeJSON(c, http.StatusNotFound, map[string]string{"error": "not_found"})
		return
	}
	if c.Request.Method != http.MethodPost {
		writeJSON(c, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}

	var body struct {
		UserID uint64 `json:"user_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.UserID == 0 {
		body.UserID = 1
	}

	user, err := h.deps.Repo.GetUserByID(c.Request.Context(), body.UserID)
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "user_not_found", "message": err.Error()})
		return
	}

	sessionID, _, err := h.deps.Sessions.CreateSession(repositoryUserToSessionUser(user), systemSessionTTL)
	if err != nil {
		writeJSON(c, http.StatusInternalServerError, map[string]string{"error": "session_failed", "message": err.Error()})
		return
	}

	writeJSON(c, http.StatusOK, map[string]any{
		"token": sessionID,
		"user":  user,
	})
}

// HandleDevUsers lists seed users for the dev login picker (development only).
func (h *AuthHandler) HandleDevUsers(c *gin.Context) {
	if !h.deps.Config.DevMode {
		writeJSON(c, http.StatusNotFound, map[string]string{"error": "not_found"})
		return
	}
	if c.Request.Method != http.MethodGet {
		writeJSON(c, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}

	users, err := h.deps.Repo.ListAllUsers(c.Request.Context())
	if err != nil {
		writeJSON(c, http.StatusInternalServerError, map[string]string{
			"error":   "list_failed",
			"message": err.Error(),
		})
		return
	}
	writeJSON(c, http.StatusOK, map[string]any{"items": users})
}

// Middleware loads the Bearer session into request context when present.
func (h *AuthHandler) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if sessionID := h.sessionIDFromRequest(c); sessionID != "" {
			if record, ok := h.loadSession(c.Request.Context(), sessionID); ok {
				ctx := context.WithValue(c.Request.Context(), authContextKey{}, record)
				c.Request = c.Request.WithContext(ctx)
			}
		}
		c.Next()
	}
}

// RequireAuth rejects requests without a valid session.
func (h *AuthHandler) RequireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		if _, ok := sessionFromContext(c.Request.Context()); !ok {
			writeJSON(c, http.StatusUnauthorized, map[string]string{
				"error":   "unauthorized",
				"message": "login required",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

func (h *AuthHandler) sessionIDFromRequest(c *gin.Context) string {
	auth := strings.TrimSpace(c.GetHeader("Authorization"))
	if strings.HasPrefix(strings.ToLower(auth), "bearer ") {
		return strings.TrimSpace(auth[7:])
	}
	return ""
}

func (h *AuthHandler) frontendRedirectURL(returnTo string) string {
	if safeFrontendOrigin(returnTo) {
		return strings.TrimRight(returnTo, "/")
	}
	return strings.TrimRight(h.deps.Config.Auth.FrontendRedirectURL, "/")
}

func (h *AuthHandler) redirectWithError(c *gin.Context, returnTo, message string) {
	base := h.frontendRedirectURL(returnTo)
	values := url.Values{}
	values.Set("auth_error", message)
	c.Redirect(http.StatusFound, base+"?"+values.Encode())
}

// resolveFrontendReturnTo picks where to send the browser after OAuth.
// Prefer explicit return_to, then Origin/Referer, then configured default.
func resolveFrontendReturnTo(c *gin.Context, fallback string) string {
	candidates := []string{
		strings.TrimSpace(c.Query("return_to")),
		strings.TrimSpace(c.GetHeader("Origin")),
	}
	if ref := strings.TrimSpace(c.GetHeader("Referer")); ref != "" {
		if u, err := url.Parse(ref); err == nil && u.Scheme != "" && u.Host != "" {
			candidates = append(candidates, u.Scheme+"://"+u.Host)
		}
	}
	for _, candidate := range candidates {
		if safeFrontendOrigin(candidate) {
			return strings.TrimRight(candidate, "/")
		}
	}
	return strings.TrimRight(fallback, "/")
}

func safeFrontendOrigin(raw string) bool {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return false
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return false
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return false
	}
	if u.Path != "" && u.Path != "/" {
		return false
	}
	if u.RawQuery != "" || u.Fragment != "" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	if host == "localhost" || host == "127.0.0.1" || host == "0.0.0.0" {
		return true
	}
	// 仅允许私网地址，避免开放重定向
	if strings.HasPrefix(host, "10.") || strings.HasPrefix(host, "192.168.") {
		return true
	}
	if strings.HasPrefix(host, "172.") {
		parts := strings.Split(host, ".")
		if len(parts) >= 2 {
			var second int
			if _, err := fmt.Sscanf(parts[1], "%d", &second); err == nil && second >= 16 && second <= 31 {
				return true
			}
		}
	}
	return false
}

func sessionFromContext(ctx context.Context) (*session.Record, bool) {
	record, ok := ctx.Value(authContextKey{}).(*session.Record)
	return record, ok && record != nil
}

func repositoryUserToSessionUser(user repository.User) session.User {
	return session.User{
		ID:           user.ID,
		WPSUserID:    user.WPSUserID,
		Name:         user.Name,
		AvatarURL:    user.AvatarURL,
		CompanyName:  user.CompanyName,
		AccountState: user.AccountState,
	}
}
