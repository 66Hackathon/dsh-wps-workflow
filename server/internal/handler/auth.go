package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

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
func (h *AuthHandler) HandleLogin(w http.ResponseWriter, r *http.Request) {
	if !h.deps.Config.OAuthConfigured() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error":   "oauth_not_configured",
			"message": "WPS OAuth 未配置，请在 server/.env 填入 WPS_OAUTH_CLIENT_ID、WPS_OAUTH_CLIENT_SECRET 和 WPS_OAUTH_REDIRECT_URI",
		})
		return
	}

	state, err := h.deps.Sessions.CreateState()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{
			"error":   "state_create_failed",
			"message": err.Error(),
		})
		return
	}

	authURL, err := h.deps.WPS.AuthorizeURL(state)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{
			"error":   "authorize_url_failed",
			"message": err.Error(),
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"client_id":    h.deps.Config.WPS.ClientID,
		"state":        state,
		"redirect_url": authURL,
	})
}

// HandleCallback completes OAuth, persists the user, and redirects with a system token.
func (h *AuthHandler) HandleCallback(w http.ResponseWriter, r *http.Request) {
	if !h.deps.Config.OAuthConfigured() {
		h.redirectWithError(w, r, "WPS OAuth 未配置")
		return
	}

	if errCode := r.URL.Query().Get("error"); errCode != "" {
		desc := r.URL.Query().Get("error_description")
		h.redirectWithError(w, r, fmt.Sprintf("%s: %s", errCode, desc))
		return
	}

	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	if code == "" {
		h.redirectWithError(w, r, "missing authorization code")
		return
	}
	if state == "" || !h.deps.Sessions.ConsumeState(state) {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "invalid_state",
			"message": "OAuth state mismatch or expired",
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	token, err := h.deps.WPS.ExchangeCode(ctx, code)
	if err != nil {
		h.redirectWithError(w, r, "token exchange failed: "+err.Error())
		return
	}

	profile, err := h.deps.WPS.CurrentUser(ctx, token.AccessToken)
	if err != nil {
		h.redirectWithError(w, r, "load user profile failed: "+err.Error())
		return
	}

	user, err := h.deps.Repo.UpsertWPSUser(ctx, profile, token)
	if err != nil {
		h.redirectWithError(w, r, "persist user failed: "+err.Error())
		return
	}

	sessionID, _, err := h.deps.Sessions.CreateSession(repositoryUserToSessionUser(user), systemSessionTTL)
	if err != nil {
		h.redirectWithError(w, r, "create session failed: "+err.Error())
		return
	}

	redirectURL := h.frontendRedirectURL() + "?" + url.Values{"token": {sessionID}}.Encode()
	http.Redirect(w, r, redirectURL, http.StatusFound)
}

func (h *AuthHandler) HandleMe(w http.ResponseWriter, r *http.Request) {
	sessionID := h.sessionIDFromRequest(r)
	if sessionID == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{
			"error":   "unauthorized",
			"message": "login required",
		})
		return
	}

	record, ok := h.loadSession(r.Context(), sessionID)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{
			"error":   "unauthorized",
			"message": "session expired",
		})
		return
	}

	user := record.User
	if h.deps.Repo != nil {
		if fresh, err := h.deps.Repo.GetUserByID(r.Context(), record.User.ID); err == nil {
			user = repositoryUserToSessionUser(fresh)
		}
	}

	writeJSON(w, http.StatusOK, user)
}

func (h *AuthHandler) HandleAuthConfig(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"oauth_configured": h.deps.Config.OAuthConfigured(),
		"dev_mode":         h.deps.Config.DevMode,
		"login_path":       "/api/auth/login",
		"redirect_uri":     h.deps.Config.WPS.RedirectURI,
		"frontend_url":     h.deps.Config.Auth.FrontendRedirectURL,
	})
}

func (h *AuthHandler) HandleAuthStatus(w http.ResponseWriter, r *http.Request) {
	sessionID := h.sessionIDFromRequest(r)
	if sessionID == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	record, ok := h.loadSession(r.Context(), sessionID)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "session_expired"})
		return
	}

	status := map[string]any{
		"authenticated":      true,
		"provider":             "wps_oauth",
		"session_expires_at":   record.ExpiresAt.UTC().Format(time.RFC3339),
		"auto_renew_enabled":   false,
		"wps_access_expires_at": "",
		"wps_refresh_expires_at": "",
	}

	if h.deps.Repo != nil {
		tokens, err := h.deps.Repo.GetUserWPSTokens(r.Context(), record.User.ID)
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

	writeJSON(w, http.StatusOK, status)
}

func (h *AuthHandler) HandleLogout(w http.ResponseWriter, r *http.Request) {
	if sessionID := h.sessionIDFromRequest(r); sessionID != "" {
		h.deps.Sessions.Delete(sessionID)
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// HandleDevLogin creates a session for a seed user (development only).
func (h *AuthHandler) HandleDevLogin(w http.ResponseWriter, r *http.Request) {
	if !h.deps.Config.DevMode {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found"})
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}

	var body struct {
		UserID uint64 `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.UserID == 0 {
		body.UserID = 1
	}

	user, err := h.deps.Repo.GetUserByID(r.Context(), body.UserID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "user_not_found", "message": err.Error()})
		return
	}

	sessionID, _, err := h.deps.Sessions.CreateSession(repositoryUserToSessionUser(user), systemSessionTTL)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "session_failed", "message": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"token": sessionID,
		"user":  user,
	})
}

// HandleDevUsers lists seed users for the dev login picker (development only).
func (h *AuthHandler) HandleDevUsers(w http.ResponseWriter, r *http.Request) {
	if !h.deps.Config.DevMode {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found"})
		return
	}
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}

	users, err := h.deps.Repo.ListAllUsers(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{
			"error":   "list_failed",
			"message": err.Error(),
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": users})
}

// Middleware loads the Bearer session into request context when present.
func (h *AuthHandler) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if sessionID := h.sessionIDFromRequest(r); sessionID != "" {
			if record, ok := h.loadSession(r.Context(), sessionID); ok {
				r = r.WithContext(context.WithValue(r.Context(), authContextKey{}, record))
			}
		}
		next.ServeHTTP(w, r)
	})
}

// RequireAuth rejects requests without a valid session.
func (h *AuthHandler) RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := sessionFromContext(r.Context()); !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{
				"error":   "unauthorized",
				"message": "login required",
			})
			return
		}
		next(w, r)
	}
}

func (h *AuthHandler) sessionIDFromRequest(r *http.Request) string {
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if strings.HasPrefix(strings.ToLower(auth), "bearer ") {
		return strings.TrimSpace(auth[7:])
	}
	return ""
}

func (h *AuthHandler) frontendRedirectURL() string {
	return strings.TrimRight(h.deps.Config.Auth.FrontendRedirectURL, "/")
}

func (h *AuthHandler) redirectWithError(w http.ResponseWriter, r *http.Request, message string) {
	base := strings.TrimRight(h.deps.Config.Auth.FrontendRedirectURL, "/")
	values := url.Values{}
	values.Set("auth_error", message)
	http.Redirect(w, r, base+"?"+values.Encode(), http.StatusFound)
}

func sessionFromContext(ctx context.Context) (*session.Record, bool) {
	record, ok := ctx.Value(authContextKey{}).(*session.Record)
	return record, ok && record != nil
}

func repositoryUserToSessionUser(user repository.User) session.User {
	return session.User{
		ID:             user.ID,
		WPSUserID:      user.WPSUserID,
		Name:           user.Name,
		NickName:       user.NickName,
		AvatarURL:      user.AvatarURL,
		CompanyName:    user.CompanyName,
		OrganizationID: user.OrganizationID,
		AccountState:   user.AccountState,
	}
}
