package handler

import (
	"github.com/gin-gonic/gin"

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

func (h *UserHandler) handleList(c *gin.Context) {
	if _, ok := sessionFromContext(c.Request.Context()); !ok {
		writeJSON(c, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	items, err := h.repo.ListAllUsers(c.Request.Context())
	if err != nil {
		writeJSON(c, http.StatusInternalServerError, map[string]string{"error": "list_failed", "message": err.Error()})
		return
	}
	writeJSON(c, http.StatusOK, map[string]any{"items": items})
}
