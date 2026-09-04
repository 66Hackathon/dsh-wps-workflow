package handler

import (
	"github.com/gin-gonic/gin"

	"net/http"
	"strconv"
	"strings"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/domain"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/repository"
)

// ProjectHandler serves project endpoints.
type ProjectHandler struct {
	repo *repository.Repository
	auth *AuthHandler
}

func NewProjectHandler(repo *repository.Repository, auth *AuthHandler) *ProjectHandler {
	return &ProjectHandler{repo: repo, auth: auth}
}

func (h *ProjectHandler) handleGet(c *gin.Context) {
	id, err := parsePathUint64(c, "id")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	project, err := h.repo.GetProject(c.Request.Context(), id)
	if err != nil {
		writeJSON(c, http.StatusNotFound, map[string]string{"error": "not_found", "message": err.Error()})
		return
	}
	writeJSON(c, http.StatusOK, project)
}

func (h *ProjectHandler) handleCreate(c *gin.Context) {
	record, ok := sessionFromContext(c.Request.Context())
	if !ok {
		writeJSON(c, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var body struct {
		ProjectCode string `json:"project_code"`
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	if body.ProjectCode == "" || body.Name == "" {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "missing_fields", "message": "project_code and name are required"})
		return
	}
	if err := domain.ValidateProjectCreate(body.ProjectCode, body.Name, body.Description, record.User.ID); err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_fields", "message": err.Error()})
		return
	}

	projectID, err := h.repo.CreateProject(c.Request.Context(), repository.CreateProjectInput{
		ProjectCode: body.ProjectCode,
		Name:        body.Name,
		Description: body.Description,
		OwnerUserID: record.User.ID,
		CreatedBy:   record.User.ID,
	})
	if err != nil {
		writeJSON(c, http.StatusInternalServerError, map[string]string{"error": "create_failed", "message": err.Error()})
		return
	}
	detail, err := h.repo.GetProject(c.Request.Context(), projectID)
	if err != nil {
		writeJSON(c, http.StatusInternalServerError, map[string]string{"error": "create_failed", "message": err.Error()})
		return
	}
	writeJSON(c, http.StatusCreated, detail)
}

func (h *ProjectHandler) handleListMembers(c *gin.Context) {
	id, err := parsePathUint64(c, "id")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	members, err := h.repo.ListProjectMembers(c.Request.Context(), id)
	if err != nil {
		writeJSON(c, http.StatusInternalServerError, map[string]string{"error": "list_failed", "message": err.Error()})
		return
	}
	writeJSON(c, http.StatusOK, map[string]any{"items": members})
}

func (h *ProjectHandler) handleAddMember(c *gin.Context) {
	record, ok := sessionFromContext(c.Request.Context())
	if !ok {
		writeJSON(c, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	projectID, err := parsePathUint64(c, "id")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}

	if err := h.requireProjectManager(c, projectID, record.User.ID); err != nil {
		writeForbidden(c, err)
		return
	}

	var body struct {
		UserID    uint64   `json:"user_id"`
		RoleCodes []string `json:"role_codes"`
		RoleCode  string   `json:"role_code"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	if len(body.RoleCodes) == 0 && body.RoleCode != "" {
		body.RoleCodes = legacyRoleToUI(body.RoleCode)
	}
	if err := domain.ValidateAddProjectMember(body.UserID, body.RoleCodes); err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_fields", "message": err.Error()})
		return
	}

	targetUser, err := h.repo.GetUserByID(c.Request.Context(), body.UserID)
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "user_not_found", "message": "user not found"})
		return
	}
	_ = targetUser

	member, err := h.repo.AddProjectMember(c.Request.Context(), repository.AddProjectMemberInput{
		ProjectID: projectID,
		UserID:    body.UserID,
		RoleCodes: body.RoleCodes,
		InvitedBy: record.User.ID,
	})
	if err != nil {
		if strings.Contains(err.Error(), "already a project member") {
			writeJSON(c, http.StatusConflict, map[string]string{"error": "duplicate_member", "message": err.Error()})
			return
		}
		writeJSON(c, http.StatusInternalServerError, map[string]string{"error": "add_failed", "message": err.Error()})
		return
	}
	writeJSON(c, http.StatusCreated, member)
}

func (h *ProjectHandler) handleUpdateMember(c *gin.Context) {
	record, ok := sessionFromContext(c.Request.Context())
	if !ok {
		writeJSON(c, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	projectID, err := parsePathUint64(c, "id")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	memberID, err := parsePathUint64(c, "memberId")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_member_id"})
		return
	}

	if err := h.requireProjectManager(c, projectID, record.User.ID); err != nil {
		writeForbidden(c, err)
		return
	}

	var body struct {
		RoleCodes []string `json:"role_codes"`
		RoleCode  string   `json:"role_code"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	if len(body.RoleCodes) == 0 && body.RoleCode != "" {
		body.RoleCodes = legacyRoleToUI(body.RoleCode)
	}
	if err := domain.ValidateUIRoles(body.RoleCodes, false); err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_fields", "message": err.Error()})
		return
	}

	member, err := h.repo.UpdateProjectMemberRoles(c.Request.Context(), projectID, memberID, body.RoleCodes)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			writeJSON(c, http.StatusNotFound, map[string]string{"error": "not_found", "message": err.Error()})
			return
		}
		writeJSON(c, http.StatusInternalServerError, map[string]string{"error": "update_failed", "message": err.Error()})
		return
	}
	writeJSON(c, http.StatusOK, member)
}

func (h *ProjectHandler) handleRemoveMember(c *gin.Context) {
	record, ok := sessionFromContext(c.Request.Context())
	if !ok {
		writeJSON(c, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	projectID, err := parsePathUint64(c, "id")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	memberID, err := parsePathUint64(c, "memberId")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_member_id"})
		return
	}

	if err := h.requireProjectManager(c, projectID, record.User.ID); err != nil {
		writeForbidden(c, err)
		return
	}

	if err := h.repo.RemoveProjectMember(c.Request.Context(), projectID, memberID); err != nil {
		if strings.Contains(err.Error(), "not found") {
			writeJSON(c, http.StatusNotFound, map[string]string{"error": "not_found", "message": err.Error()})
			return
		}
		if strings.Contains(err.Error(), "sole project manager") {
			writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_operation", "message": err.Error()})
			return
		}
		writeJSON(c, http.StatusInternalServerError, map[string]string{"error": "remove_failed", "message": err.Error()})
		return
	}
	writeJSON(c, http.StatusOK, map[string]string{"status": "removed"})
}

func (h *ProjectHandler) requireProjectManager(c *gin.Context, projectID, userID uint64) error {
	ok, err := h.repo.MemberCanManageProject(c.Request.Context(), projectID, userID)
	if err != nil {
		return err
	}
	if !ok {
		return errNotProjectOwner
	}
	return nil
}

func legacyRoleToUI(roleCode string) []string {
	switch roleCode {
	case "PROJECT_ADMIN":
		return []string{domain.UIRoleProjectAdmin}
	default:
		return []string{domain.UIRoleMember}
	}
}

func (h *ProjectHandler) requireProjectOwner(c *gin.Context, projectID, userID uint64) error {
	return h.requireProjectManager(c, projectID, userID)
}

var errNotProjectOwner = &forbiddenError{message: "only project manager can manage members"}

type forbiddenError struct {
	message string
}

func (e *forbiddenError) Error() string {
	return e.message
}

func writeForbidden(c *gin.Context, err error) {
	if fe, ok := err.(*forbiddenError); ok {
		writeJSON(c, http.StatusForbidden, map[string]string{"error": "forbidden", "message": fe.message})
		return
	}
	writeJSON(c, http.StatusInternalServerError, map[string]string{"error": "check_failed", "message": err.Error()})
}

func (h *ProjectHandler) handleUpdateSetup(c *gin.Context) {
	record, ok := sessionFromContext(c.Request.Context())
	if !ok {
		writeJSON(c, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	projectID, err := parsePathUint64(c, "id")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}

	if err := h.requireProjectManager(c, projectID, record.User.ID); err != nil {
		writeForbidden(c, err)
		return
	}

	var body struct {
		Name         *string `json:"name"`
		Description  *string `json:"description"`
		WPSGroupID   *string `json:"wps_group_id"`
		WPSGroupName *string `json:"wps_group_name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}

	project, err := h.repo.UpdateProjectSetup(c.Request.Context(), projectID, repository.UpdateProjectSetupInput{
		Name:         body.Name,
		Description:  body.Description,
		WPSGroupID:   body.WPSGroupID,
		WPSGroupName: body.WPSGroupName,
	})
	if err != nil {
		msg := err.Error()
		status := http.StatusInternalServerError
		if strings.Contains(msg, "required") {
			status = http.StatusBadRequest
		}
		writeJSON(c, status, map[string]string{"error": "update_failed", "message": msg})
		return
	}
	writeJSON(c, http.StatusOK, project)
}

func (h *ProjectHandler) handleDelete(c *gin.Context) {
	record, ok := sessionFromContext(c.Request.Context())
	if !ok {
		writeJSON(c, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	projectID, err := parsePathUint64(c, "id")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	if err := h.requireProjectManager(c, projectID, record.User.ID); err != nil {
		writeForbidden(c, err)
		return
	}
	if err := h.repo.DeleteProject(c.Request.Context(), projectID); err != nil {
		writeJSON(c, http.StatusInternalServerError, map[string]string{"error": "delete_failed", "message": err.Error()})
		return
	}
	writeJSON(c, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *ProjectHandler) handleListRepositories(c *gin.Context) {
	projectID, err := parsePathUint64(c, "id")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	items, err := h.repo.ListProjectRepositories(c.Request.Context(), projectID)
	if err != nil {
		writeJSON(c, http.StatusInternalServerError, map[string]string{"error": "list_failed", "message": err.Error()})
		return
	}
	writeJSON(c, http.StatusOK, map[string]any{"items": items})
}

func (h *ProjectHandler) handleCreateRepository(c *gin.Context) {
	record, ok := sessionFromContext(c.Request.Context())
	if !ok {
		writeJSON(c, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	projectID, err := parsePathUint64(c, "id")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	if err := h.requireProjectManager(c, projectID, record.User.ID); err != nil {
		writeForbidden(c, err)
		return
	}

	var body struct {
		RepoName      string `json:"repo_name"`
		RepoURL       string `json:"repo_url"`
		DefaultBranch string `json:"default_branch"`
		DevDirection  string `json:"dev_direction"`
		SortOrder     uint32 `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}

	item, err := h.repo.CreateProjectRepository(c.Request.Context(), repository.CreateProjectRepositoryInput{
		ProjectID:     projectID,
		RepoName:      body.RepoName,
		RepoURL:       body.RepoURL,
		DefaultBranch: body.DefaultBranch,
		DevDirection:  body.DevDirection,
		SortOrder:     body.SortOrder,
	})
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "create_failed", "message": err.Error()})
		return
	}
	writeJSON(c, http.StatusCreated, item)
}

func (h *ProjectHandler) handleReplaceRepositories(c *gin.Context) {
	record, ok := sessionFromContext(c.Request.Context())
	if !ok {
		writeJSON(c, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	projectID, err := parsePathUint64(c, "id")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	if err := h.requireProjectManager(c, projectID, record.User.ID); err != nil {
		writeForbidden(c, err)
		return
	}

	var body struct {
		Items []struct {
			RepoName      string `json:"repo_name"`
			RepoURL       string `json:"repo_url"`
			DefaultBranch string `json:"default_branch"`
			DevDirection  string `json:"dev_direction"`
			SortOrder     uint32 `json:"sort_order"`
		} `json:"items"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}

	inputs := make([]repository.CreateProjectRepositoryInput, 0, len(body.Items))
	for i, item := range body.Items {
		sortOrder := item.SortOrder
		if sortOrder == 0 {
			sortOrder = uint32(i + 1)
		}
		inputs = append(inputs, repository.CreateProjectRepositoryInput{
			ProjectID:     projectID,
			RepoName:      item.RepoName,
			RepoURL:       item.RepoURL,
			DefaultBranch: item.DefaultBranch,
			DevDirection:  item.DevDirection,
			SortOrder:     sortOrder,
		})
	}

	items, err := h.repo.ReplaceProjectRepositories(c.Request.Context(), projectID, inputs)
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "replace_failed", "message": err.Error()})
		return
	}
	writeJSON(c, http.StatusOK, map[string]any{"items": items})
}

func (h *ProjectHandler) handleUpdateRepository(c *gin.Context) {
	record, ok := sessionFromContext(c.Request.Context())
	if !ok {
		writeJSON(c, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	projectID, err := parsePathUint64(c, "id")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	repoID, err := parsePathUint64(c, "repoId")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_repo_id"})
		return
	}
	if err := h.requireProjectManager(c, projectID, record.User.ID); err != nil {
		writeForbidden(c, err)
		return
	}

	var body struct {
		RepoName      *string `json:"repo_name"`
		RepoURL       *string `json:"repo_url"`
		DefaultBranch *string `json:"default_branch"`
		DevDirection  *string `json:"dev_direction"`
		SortOrder     *uint32 `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}

	item, err := h.repo.UpdateProjectRepository(c.Request.Context(), projectID, repoID, repository.UpdateProjectRepositoryInput{
		RepoName:      body.RepoName,
		RepoURL:       body.RepoURL,
		DefaultBranch: body.DefaultBranch,
		DevDirection:  body.DevDirection,
		SortOrder:     body.SortOrder,
	})
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		writeJSON(c, status, map[string]string{"error": "update_failed", "message": err.Error()})
		return
	}
	writeJSON(c, http.StatusOK, item)
}

func (h *ProjectHandler) handleDeleteRepository(c *gin.Context) {
	record, ok := sessionFromContext(c.Request.Context())
	if !ok {
		writeJSON(c, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	projectID, err := parsePathUint64(c, "id")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	repoID, err := parsePathUint64(c, "repoId")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_repo_id"})
		return
	}
	if err := h.requireProjectManager(c, projectID, record.User.ID); err != nil {
		writeForbidden(c, err)
		return
	}

	if err := h.repo.DeleteProjectRepository(c.Request.Context(), projectID, repoID); err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		writeJSON(c, status, map[string]string{"error": "delete_failed", "message": err.Error()})
		return
	}
	writeJSON(c, http.StatusOK, map[string]string{"status": "deleted"})
}

func parsePathUint64(c *gin.Context, key string) (uint64, error) {
	raw := c.Param(key)
	if raw == "" {
		return 0, strconv.ErrSyntax
	}
	v, err := strconv.ParseUint(raw, 10, 64)
	return v, err
}
