package handler

import (
	"net/http"

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

// registerRoutes mounts every TeamSpace API route on mux.
// All routes are defined here as the single source of truth.
func registerRoutes(mux *http.ServeMux, h *Handlers, cfg config.Config) {
	auth := h.Auth.RequireAuth

	// ── Health ──────────────────────────────────────────────────────────────
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// ── Auth ───────────────────────────────────────────────────────────────
	mux.HandleFunc("GET /api/auth/login", h.Auth.HandleLogin)
	mux.HandleFunc("GET /api/auth/callback", h.Auth.HandleCallback)
	mux.HandleFunc("GET /api/auth/config", h.Auth.HandleAuthConfig)
	mux.HandleFunc("GET /api/auth/me", h.Auth.HandleMe)
	mux.HandleFunc("GET /api/auth/status", h.Auth.HandleAuthStatus)
	mux.HandleFunc("POST /api/auth/logout", h.Auth.HandleLogout)
	if cfg.DevMode {
		mux.HandleFunc("POST /api/auth/dev-login", h.Auth.HandleDevLogin)
		mux.HandleFunc("GET /api/auth/dev-users", h.Auth.HandleDevUsers)
	}

	// ── Users（系统用户列表，供成员选择）────────────────────────────────────
	mux.HandleFunc("GET /api/users", auth(h.User.handleList))
	mux.HandleFunc("GET /api/workspace", auth(h.handleWorkspace))

	// ── Projects ───────────────────────────────────────────────────────────
	mux.HandleFunc("GET /api/projects", auth(h.handleListProjects))
	mux.HandleFunc("GET /api/projects/{id}", auth(h.Project.handleGet))
	mux.HandleFunc("POST /api/projects", auth(h.Project.handleCreate))
	mux.HandleFunc("PATCH /api/projects/{id}/setup", auth(h.Project.handleUpdateSetup))
	mux.HandleFunc("DELETE /api/projects/{id}", auth(h.Project.handleDelete))
	mux.HandleFunc("GET /api/projects/{id}/repositories", auth(h.Project.handleListRepositories))
	mux.HandleFunc("POST /api/projects/{id}/repositories", auth(h.Project.handleCreateRepository))
	mux.HandleFunc("PUT /api/projects/{id}/repositories", auth(h.Project.handleReplaceRepositories))
	mux.HandleFunc("PATCH /api/projects/{id}/repositories/{repoId}", auth(h.Project.handleUpdateRepository))
	mux.HandleFunc("DELETE /api/projects/{id}/repositories/{repoId}", auth(h.Project.handleDeleteRepository))
	mux.HandleFunc("GET /api/projects/{id}/members", auth(h.Project.handleListMembers))
	mux.HandleFunc("POST /api/projects/{id}/members", auth(h.Project.handleAddMember))
	mux.HandleFunc("PATCH /api/projects/{id}/members/{memberId}", auth(h.Project.handleUpdateMember))
	mux.HandleFunc("DELETE /api/projects/{id}/members/{memberId}", auth(h.Project.handleRemoveMember))

	// ── Requirements / Work Items ──────────────────────────────────────────
	mux.HandleFunc("GET /api/projects/{projectId}/requirements", auth(h.Requirement.handleList))
	mux.HandleFunc("POST /api/projects/{projectId}/requirements", auth(h.Requirement.handleCreate))
	mux.HandleFunc("GET /api/requirements/{id}", auth(h.Requirement.handleGet))
	mux.HandleFunc("PATCH /api/requirements/{id}", auth(h.Requirement.handleUpdate))
	mux.HandleFunc("GET /api/requirements/{id}/timeline", auth(h.Requirement.handleTimeline))
	mux.HandleFunc("POST /api/requirements/{id}/transition", auth(h.Requirement.handleTransition))
	mux.HandleFunc("POST /api/requirements/{id}/development/complete", auth(h.Requirement.handleCompleteDevelopment))
	// Bug 子项（item_type = BUG，挂在主工作项下）
	mux.HandleFunc("GET /api/requirements/{id}/bugs", auth(h.Requirement.handleListBugs))
	mux.HandleFunc("POST /api/requirements/{id}/bugs", auth(h.Requirement.handleCreateBug))
	// 回归结果变更（FAIL → PASS）
	mux.HandleFunc("PATCH /api/requirements/{id}/regression", auth(h.Requirement.handleUpdateRegression))

	// ── AI（stub）────────────────────────────────────────────────────────────
	mux.HandleFunc("POST /api/ai/run", auth(h.AI.handleRun))

	// ── WPS 协作能力（通讯录 / 群聊 / 云文档）──────────────────────────────
	mux.HandleFunc("GET /api/wps/contacts/search", auth(h.WPS.handleSearchContacts))
	mux.HandleFunc("POST /api/wps/contacts/ensure", auth(h.WPS.handleEnsureContacts))
	mux.HandleFunc("GET /api/wps/chats", auth(h.WPS.handleListChats))
	mux.HandleFunc("POST /api/wps/chats/create", auth(h.WPS.handleCreateChat))
	mux.HandleFunc("POST /api/projects/{id}/wps/create-group", auth(h.WPS.handleCreateProjectGroup))
	mux.HandleFunc("GET /api/wps/documents", auth(h.WPS.handleSearchDocuments))

}

func (h *Handlers) handleListProjects(w http.ResponseWriter, r *http.Request) {
	projects, err := h.Repo.ListProjects(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{
			"error":   "list_projects_failed",
			"message": err.Error(),
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": projects})
}

func (h *Handlers) handleWorkspace(w http.ResponseWriter, r *http.Request) {
	record, ok := sessionFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	summary, err := h.Repo.GetWorkspaceSummary(r.Context(), record.User.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{
			"error":   "workspace_failed",
			"message": err.Error(),
		})
		return
	}
	writeJSON(w, http.StatusOK, summary)
}
