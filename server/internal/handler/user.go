package handler

import (
	"net/http"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/repository"
)

// UserHandler serves organization user endpoints.
type UserHandler struct {
	repo *repository.Repository
	auth *AuthHandler
}

func NewUserHandler(repo *repository.Repository, auth *AuthHandler) *UserHandler {
	return &UserHandler{repo: repo, auth: auth}
}

func (h *UserHandler) handleList(w http.ResponseWriter, r *http.Request) {
	if _, ok := sessionFromContext(r.Context()); !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	items, err := h.repo.ListAllUsers(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list_failed", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}
