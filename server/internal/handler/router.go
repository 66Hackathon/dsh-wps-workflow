package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/auth/session"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/auth/wps"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/config"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/repository"
)

// NewRouter builds the TeamSpace HTTP handler tree.
func NewRouter(cfg config.Config, repo *repository.Repository, auth *AuthHandler, _ *session.Manager, wpsClient *wps.Client) http.Handler {
	mux := http.NewServeMux()
	handlers := NewHandlers(repo, auth, wpsClient)
	registerRoutes(mux, handlers, cfg)
	return withCORS(cfg, auth.Middleware(mux))
}

func withCORS(cfg config.Config, next http.Handler) http.Handler {
	allowedOrigin := strings.TrimRight(cfg.Auth.FrontendRedirectURL, "/")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && (origin == allowedOrigin || allowedOrigin == "") {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
