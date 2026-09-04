package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/auth/wps"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/config"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/repository"
)

// Handlers groups HTTP handlers for route registration.
type Handlers struct {
	Auth        *AuthHandler
	Project     *ProjectHandler
	User        *UserHandler
	Requirement *RequirementHandler
	Bug         *BugHandler
	AI          *AIHandler
	WPS         *WPSHandler
	Repo        *repository.Repository
}

// NewHandlers constructs all handler dependencies.
func NewHandlers(repo *repository.Repository, auth *AuthHandler, wpsClient *wps.Client) *Handlers {
	return &Handlers{
		Auth:        auth,
		Project:     NewProjectHandler(repo, auth),
		User:        NewUserHandler(repo, auth),
		Requirement: NewRequirementHandler(repo, auth),
		Bug:         NewBugHandler(repo, auth),
		AI:          NewAIHandler(),
		WPS:         NewWPSHandler(repo, auth, wpsClient),
		Repo:        repo,
	}
}

// RegisterRoutes mounts every TeamSpace API route on the Gin engine.
// All routes are defined here as the single source of truth.
func RegisterRoutes(r *gin.Engine, h *Handlers, cfg config.Config) {
	r.GET("/healthz", func(c *gin.Context) {
		writeJSON(c, http.StatusOK, map[string]string{"status": "ok"})
	})

	authPublic := r.Group("/api/auth")
	{
		authPublic.GET("/login", h.Auth.HandleLogin)
		authPublic.GET("/callback", h.Auth.HandleCallback)
		authPublic.GET("/config", h.Auth.HandleAuthConfig)
		authPublic.GET("/me", h.Auth.HandleMe)
		authPublic.GET("/status", h.Auth.HandleAuthStatus)
		authPublic.POST("/logout", h.Auth.HandleLogout)
		if cfg.DevMode {
			authPublic.POST("/dev-login", h.Auth.HandleDevLogin)
			authPublic.GET("/dev-users", h.Auth.HandleDevUsers)
		}
	}

	api := r.Group("/api")
	api.Use(h.Auth.RequireAuth())
	{
		api.GET("/users", h.User.handleList)
		api.GET("/workspace", h.handleWorkspace)

		api.GET("/projects", h.handleListProjects)
		api.GET("/projects/:id", h.Project.handleGet)
		api.POST("/projects", h.Project.handleCreate)
		api.PATCH("/projects/:id/setup", h.Project.handleUpdateSetup)
		api.DELETE("/projects/:id", h.Project.handleDelete)
		api.GET("/projects/:id/repositories", h.Project.handleListRepositories)
		api.POST("/projects/:id/repositories", h.Project.handleCreateRepository)
		api.PUT("/projects/:id/repositories", h.Project.handleReplaceRepositories)
		api.PATCH("/projects/:id/repositories/:repoId", h.Project.handleUpdateRepository)
		api.DELETE("/projects/:id/repositories/:repoId", h.Project.handleDeleteRepository)
		api.GET("/projects/:id/members", h.Project.handleListMembers)
		api.POST("/projects/:id/members", h.Project.handleAddMember)
		api.PATCH("/projects/:id/members/:memberId", h.Project.handleUpdateMember)
		api.DELETE("/projects/:id/members/:memberId", h.Project.handleRemoveMember)

		api.GET("/projects/:id/requirements", h.Requirement.handleList)
		api.POST("/projects/:id/requirements", h.Requirement.handleCreate)
		api.GET("/requirements/:id", h.Requirement.handleGet)
		api.PATCH("/requirements/:id", h.Requirement.handleUpdate)
		api.GET("/requirements/:id/timeline", h.Requirement.handleTimeline)
		api.POST("/requirements/:id/transition", h.Requirement.handleTransition)
		api.POST("/requirements/:id/development/complete", h.Requirement.handleCompleteDevelopment)
		api.GET("/requirements/:id/bugs", h.Requirement.handleListBugs)
		api.POST("/requirements/:id/bugs", h.Requirement.handleCreateBug)
		api.PATCH("/requirements/:id/regression", h.Requirement.handleUpdateRegression)

		api.POST("/ai/run", h.AI.handleRun)

		api.GET("/wps/contacts/search", h.WPS.handleSearchContacts)
		api.POST("/wps/contacts/ensure", h.WPS.handleEnsureContacts)
		api.GET("/wps/chats", h.WPS.handleListChats)
		api.POST("/wps/chats/create", h.WPS.handleCreateChat)
		api.POST("/projects/:id/wps/create-group", h.WPS.handleCreateProjectGroup)
		api.GET("/wps/documents", h.WPS.handleSearchDocuments)
	}
}

func (h *Handlers) handleListProjects(c *gin.Context) {
	projects, err := h.Repo.ListProjects(c.Request.Context())
	if err != nil {
		writeJSON(c, http.StatusInternalServerError, map[string]string{
			"error":   "list_projects_failed",
			"message": err.Error(),
		})
		return
	}
	writeJSON(c, http.StatusOK, map[string]any{"items": projects})
}

func (h *Handlers) handleWorkspace(c *gin.Context) {
	record, ok := sessionFromContext(c.Request.Context())
	if !ok {
		writeJSON(c, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	summary, err := h.Repo.GetWorkspaceSummary(c.Request.Context(), record.User.ID)
	if err != nil {
		writeJSON(c, http.StatusInternalServerError, map[string]string{
			"error":   "workspace_failed",
			"message": err.Error(),
		})
		return
	}
	writeJSON(c, http.StatusOK, summary)
}
