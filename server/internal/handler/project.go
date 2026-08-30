package handler

import (
	"encoding/json"
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

func (h *ProjectHandler) handleGet(w http.ResponseWriter, r *http.Request) {
	id, err := parsePathUint64(r, "id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	project, err := h.repo.GetProject(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, project)
}

func (h *ProjectHandler) handleCreate(w http.ResponseWriter, r *http.Request) {
	record, ok := sessionFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var body struct {
		ProjectCode string `json:"project_code"`
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	if body.ProjectCode == "" || body.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing_fields", "message": "project_code and name are required"})
		return
	}
	if err := domain.ValidateProjectCreate(body.ProjectCode, body.Name, body.Description, record.User.ID); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_fields", "message": err.Error()})
		return
	}

	projectID, err := h.repo.CreateProject(r.Context(), repository.CreateProjectInput{
		OrganizationID: record.User.OrganizationID,
		ProjectCode:    body.ProjectCode,
		Name:           body.Name,
		Description:    body.Description,
		OwnerUserID:    record.User.ID,
		CreatedBy:      record.User.ID,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create_failed", "message": err.Error()})
		return
	}
	detail, err := h.repo.GetProject(r.Context(), projectID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create_failed", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, detail)
}

func (h *ProjectHandler) handleListMembers(w http.ResponseWriter, r *http.Request) {
	id, err := parsePathUint64(r, "id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	members, err := h.repo.ListProjectMembers(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list_failed", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": members})
}

func (h *ProjectHandler) handleAddMember(w http.ResponseWriter, r *http.Request) {
	record, ok := sessionFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	projectID, err := parsePathUint64(r, "id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}

	if err := h.requireProjectManager(r, projectID, record.User.ID); err != nil {
		writeForbidden(w, err)
		return
	}

	var body struct {
		UserID    uint64   `json:"user_id"`
		RoleCodes []string `json:"role_codes"`
		RoleCode  string   `json:"role_code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	if len(body.RoleCodes) == 0 && body.RoleCode != "" {
		body.RoleCodes = legacyRoleToUI(body.RoleCode)
	}
	if err := domain.ValidateAddProjectMember(body.UserID, body.RoleCodes); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_fields", "message": err.Error()})
		return
	}

	targetUser, err := h.repo.GetUserByID(r.Context(), body.UserID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "user_not_found", "message": "user not found"})
		return
	}
	_ = targetUser

	member, err := h.repo.AddProjectMember(r.Context(), repository.AddProjectMemberInput{
		ProjectID: projectID,
		UserID:    body.UserID,
		RoleCodes: body.RoleCodes,
		InvitedBy: record.User.ID,
	})
	if err != nil {
		if strings.Contains(err.Error(), "already a project member") {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "duplicate_member", "message": err.Error()})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "add_failed", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, member)
}

func (h *ProjectHandler) handleUpdateMember(w http.ResponseWriter, r *http.Request) {
	record, ok := sessionFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	projectID, err := parsePathUint64(r, "id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	memberID, err := parsePathUint64(r, "memberId")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_member_id"})
		return
	}

	if err := h.requireProjectManager(r, projectID, record.User.ID); err != nil {
		writeForbidden(w, err)
		return
	}

	var body struct {
		RoleCodes []string `json:"role_codes"`
		RoleCode  string   `json:"role_code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	if len(body.RoleCodes) == 0 && body.RoleCode != "" {
		body.RoleCodes = legacyRoleToUI(body.RoleCode)
	}
	if err := domain.ValidateUIRoles(body.RoleCodes, false); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_fields", "message": err.Error()})
		return
	}

	member, err := h.repo.UpdateProjectMemberRoles(r.Context(), projectID, memberID, body.RoleCodes)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found", "message": err.Error()})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "update_failed", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, member)
}

func (h *ProjectHandler) handleRemoveMember(w http.ResponseWriter, r *http.Request) {
	record, ok := sessionFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	projectID, err := parsePathUint64(r, "id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	memberID, err := parsePathUint64(r, "memberId")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_member_id"})
		return
	}

	if err := h.requireProjectManager(r, projectID, record.User.ID); err != nil {
		writeForbidden(w, err)
		return
	}

	if err := h.repo.RemoveProjectMember(r.Context(), projectID, memberID); err != nil {
		if strings.Contains(err.Error(), "not found") {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found", "message": err.Error()})
			return
		}
		if strings.Contains(err.Error(), "sole project manager") {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_operation", "message": err.Error()})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "remove_failed", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "removed"})
}

func (h *ProjectHandler) requireProjectManager(r *http.Request, projectID, userID uint64) error {
	ok, err := h.repo.MemberCanManageProject(r.Context(), projectID, userID)
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

func (h *ProjectHandler) requireProjectOwner(r *http.Request, projectID, userID uint64) error {
	return h.requireProjectManager(r, projectID, userID)
}

var errNotProjectOwner = &forbiddenError{message: "only project manager can manage members"}

type forbiddenError struct {
	message string
}

func (e *forbiddenError) Error() string {
	return e.message
}

func writeForbidden(w http.ResponseWriter, err error) {
	if fe, ok := err.(*forbiddenError); ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": fe.message})
		return
	}
	writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "check_failed", "message": err.Error()})
}

func (h *ProjectHandler) handleUpdateSetup(w http.ResponseWriter, r *http.Request) {
	record, ok := sessionFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	projectID, err := parsePathUint64(r, "id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}

	if err := h.requireProjectManager(r, projectID, record.User.ID); err != nil {
		writeForbidden(w, err)
		return
	}

	var body struct {
		Name             *string `json:"name"`
		Description      *string `json:"description"`
		GitRepoURL       *string `json:"git_repo_url"`
		GitDefaultBranch *string `json:"git_default_branch"`
		WPSGroupID       *string `json:"wps_group_id"`
		WPSGroupName     *string `json:"wps_group_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}

	project, err := h.repo.UpdateProjectSetup(r.Context(), projectID, repository.UpdateProjectSetupInput{
		Name:             body.Name,
		Description:      body.Description,
		GitRepoURL:       body.GitRepoURL,
		GitDefaultBranch: body.GitDefaultBranch,
		WPSGroupID:       body.WPSGroupID,
		WPSGroupName:     body.WPSGroupName,
	})
	if err != nil {
		msg := err.Error()
		status := http.StatusInternalServerError
		if strings.Contains(msg, "required") {
			status = http.StatusBadRequest
		}
		writeJSON(w, status, map[string]string{"error": "update_failed", "message": msg})
		return
	}
	writeJSON(w, http.StatusOK, project)
}

func (h *ProjectHandler) handleDelete(w http.ResponseWriter, r *http.Request) {
	record, ok := sessionFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	projectID, err := parsePathUint64(r, "id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	if err := h.requireProjectManager(r, projectID, record.User.ID); err != nil {
		writeForbidden(w, err)
		return
	}
	if err := h.repo.DeleteProject(r.Context(), projectID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "delete_failed", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func parsePathUint64(r *http.Request, key string) (uint64, error) {
	raw := r.PathValue(key)
	if raw == "" {
		return 0, strconv.ErrSyntax
	}
	v, err := strconv.ParseUint(raw, 10, 64)
	return v, err
}
