package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/repository"
)

// BugHandler serves bug endpoints.
type BugHandler struct {
	repo *repository.Repository
	auth *AuthHandler
}

func NewBugHandler(repo *repository.Repository, auth *AuthHandler) *BugHandler {
	return &BugHandler{repo: repo, auth: auth}
}

func (h *BugHandler) handleList(w http.ResponseWriter, r *http.Request) {
	projectID, err := parsePathUint64(r, "projectId")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
		return
	}
	items, err := h.repo.ListBugs(r.Context(), projectID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list_failed", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *BugHandler) handleCreate(w http.ResponseWriter, r *http.Request) {
	record, ok := sessionFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	projectID, err := parsePathUint64(r, "projectId")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
		return
	}

	var body struct {
		RequirementID           uint64 `json:"requirement_id"`
		Title                   string `json:"title"`
		Description             string `json:"description"`
		StepsToReproduce        string `json:"steps_to_reproduce"`
		Environment             string `json:"environment"`
		Severity                string `json:"severity"`
		AssigneeUserID          uint64 `json:"assignee_user_id"`
		SecondaryAssigneeUserID uint64 `json:"secondary_assignee_user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	if body.RequirementID == 0 || strings.TrimSpace(body.Title) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing_fields", "message": "requirement_id and title are required"})
		return
	}
	description := strings.TrimSpace(body.Description)
	if description == "" {
		description = body.Title
	}

	result, err := h.repo.CreateBugWithFixRequirement(r.Context(), repository.CreateBugInput{
		ProjectID:               projectID,
		RequirementID:           body.RequirementID,
		Title:                   strings.TrimSpace(body.Title),
		Description:             description,
		StepsToReproduce:        body.StepsToReproduce,
		Environment:             body.Environment,
		Severity:                body.Severity,
		ReporterUserID:          record.User.ID,
		AssigneeUserID:          body.AssigneeUserID,
		SecondaryAssigneeUserID: body.SecondaryAssigneeUserID,
	})
	if err != nil {
		msg := err.Error()
		status := http.StatusInternalServerError
		if strings.Contains(msg, "permission denied") {
			status = http.StatusForbidden
		} else if strings.Contains(msg, "only be created") || strings.Contains(msg, "required") {
			status = http.StatusBadRequest
		}
		writeJSON(w, status, map[string]string{"error": "create_failed", "message": msg})
		return
	}
	writeJSON(w, http.StatusCreated, result)
}

func (h *BugHandler) handleRetest(w http.ResponseWriter, r *http.Request) {
	record, ok := sessionFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	bugID, err := parsePathUint64(r, "id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}

	var body struct {
		Result string `json:"result"`
		Remark string `json:"remark"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	result := strings.ToUpper(strings.TrimSpace(body.Result))
	if result != "PASS" && result != "FAIL" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_result", "message": "result must be PASS or FAIL"})
		return
	}

	item, err := h.repo.SubmitBugRetest(r.Context(), bugID, record.User.ID, result == "PASS", body.Remark)
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "permission denied") {
			status = http.StatusForbidden
		}
		writeJSON(w, status, map[string]string{"error": "retest_failed", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, item)
}
