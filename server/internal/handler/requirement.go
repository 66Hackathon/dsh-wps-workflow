package handler

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/repository"
)

// RequirementHandler serves requirement endpoints.
type RequirementHandler struct {
	repo *repository.Repository
	auth *AuthHandler
}

func NewRequirementHandler(repo *repository.Repository, auth *AuthHandler) *RequirementHandler {
	return &RequirementHandler{repo: repo, auth: auth}
}

func (h *RequirementHandler) handleList(w http.ResponseWriter, r *http.Request) {
	projectID, err := parsePathUint64(r, "projectId")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
		return
	}
	items, err := h.repo.ListRequirements(r.Context(), projectID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list_failed", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *RequirementHandler) handleGet(w http.ResponseWriter, r *http.Request) {
	id, err := parsePathUint64(r, "id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	item, err := h.repo.GetRequirement(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (h *RequirementHandler) handleUpdate(w http.ResponseWriter, r *http.Request) {
	record, ok := sessionFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	id, err := parsePathUint64(r, "id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}

	var body struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		Priority    string `json:"priority"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}

	item, err := h.repo.UpdateRequirementContent(r.Context(), id, record.User.ID, repository.UpdateRequirementContentInput{
		Title:       body.Title,
		Description: body.Description,
		Priority:    body.Priority,
	})
	if err != nil {
		msg := err.Error()
		status := http.StatusBadRequest
		if strings.Contains(msg, "not found") {
			status = http.StatusNotFound
		} else if strings.Contains(msg, "permission denied") {
			status = http.StatusForbidden
		}
		writeJSON(w, status, map[string]string{"error": "update_failed", "message": msg})
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (h *RequirementHandler) handleCreate(w http.ResponseWriter, r *http.Request) {
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
		RequirementCode        string `json:"requirement_code"`
		Title                  string `json:"title"`
		Description            string `json:"description"`
		Priority               string `json:"priority"`
		DevDirections          string `json:"dev_directions"`
		DeveloperUserID        uint64 `json:"developer_user_id"`
		BackendDeveloperUserID uint64 `json:"backend_developer_user_id"`
		TesterUserID           uint64 `json:"tester_user_id"`
		PlannedStartAt         string `json:"planned_start_at"`
		PlannedEndAt           string `json:"planned_end_at"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	if body.RequirementCode == "" || body.Title == "" || body.Description == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing_fields", "message": "requirement_code, title and description are required"})
		return
	}

	item, err := h.repo.CreateRequirement(r.Context(), repository.CreateRequirementInput{
		ProjectID:              projectID,
		RequirementCode:        body.RequirementCode,
		Title:                  body.Title,
		Description:            body.Description,
		Priority:               body.Priority,
		DevDirections:          body.DevDirections,
		DeveloperUserID:        body.DeveloperUserID,
		BackendDeveloperUserID: body.BackendDeveloperUserID,
		TesterUserID:           body.TesterUserID,
		PlannedStartAt:         parseOptionalDateTime(body.PlannedStartAt),
		PlannedEndAt:           parseOptionalDateTime(body.PlannedEndAt),
		CreatedBy:              record.User.ID,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create_failed", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (h *RequirementHandler) handleTransition(w http.ResponseWriter, r *http.Request) {
	record, ok := sessionFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	id, err := parsePathUint64(r, "id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}

	var body struct {
		ToStatus        string                          `json:"to_status"`
		StageSubmission repository.StageSubmissionInput `json:"stage_submission"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ToStatus == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing_to_status"})
		return
	}

	item, err := h.repo.TransitionRequirementStatus(r.Context(), id, record.User.ID, body.ToStatus, body.StageSubmission)
	if err != nil {
		msg := err.Error()
		status := http.StatusBadRequest
		if strings.Contains(msg, "permission denied") {
			status = http.StatusForbidden
		}
		writeJSON(w, status, map[string]string{"error": "transition_failed", "message": msg})
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (h *RequirementHandler) handleCompleteDevelopment(w http.ResponseWriter, r *http.Request) {
	record, ok := sessionFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	id, err := parsePathUint64(r, "id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}

	var body struct {
		DevSummary          string `json:"dev_summary"`
		ImplementationNotes string `json:"implementation_notes"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	result, err := h.repo.CompleteDevelopment(
		r.Context(), id, record.User.ID, body.DevSummary, body.ImplementationNotes,
	)
	if err != nil {
		msg := err.Error()
		status := http.StatusBadRequest
		if strings.Contains(msg, "only the assigned") {
			status = http.StatusForbidden
		}
		writeJSON(w, status, map[string]string{"error": "complete_development_failed", "message": msg})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// handleCreateBug creates a Bug sub-item under a parent requirement.
// The bug inherits developer/tester from the parent, starts at DEVELOPMENT.
func (h *RequirementHandler) handleCreateBug(w http.ResponseWriter, r *http.Request) {
	record, ok := sessionFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	parentID, err := parsePathUint64(r, "id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}

	var body struct {
		RequirementCode  string `json:"requirement_code"`
		Title            string `json:"title"`
		Description      string `json:"description"`
		Priority         string `json:"priority"`
		TriggeredAtStage string `json:"triggered_at_stage"` // TESTING / REGRESSION
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	if body.RequirementCode == "" || strings.TrimSpace(body.Title) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing_fields", "message": "requirement_code and title are required"})
		return
	}

	// Fetch parent to inherit developer/tester
	parent, err := h.repo.GetRequirement(r.Context(), parentID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "parent_not_found"})
		return
	}

	// Validate that creator is the tester (only tester can create a bug sub-item)
	if parent.TesterUserID == nil || *parent.TesterUserID != record.User.ID {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "only the assigned tester can create a bug sub-item"})
		return
	}

	var devID, backendID, testerID uint64
	if parent.DeveloperUserID != nil {
		devID = *parent.DeveloperUserID
	}
	if parent.BackendDeveloperUserID != nil {
		backendID = *parent.BackendDeveloperUserID
	}
	if parent.TesterUserID != nil {
		testerID = *parent.TesterUserID
	}

	triggeredAt := body.TriggeredAtStage
	if triggeredAt == "" {
		triggeredAt = parent.CurrentStatus
	}

	bug, err := h.repo.CreateBugItem(r.Context(), repository.CreateBugItemInput{
		ProjectID:              parent.ProjectID,
		RequirementCode:        body.RequirementCode,
		Title:                  strings.TrimSpace(body.Title),
		Description:            body.Description,
		Priority:               body.Priority,
		ParentItemID:           parentID,
		TriggeredAtStage:       triggeredAt,
		DeveloperUserID:        devID,
		BackendDeveloperUserID: backendID,
		TesterUserID:           testerID,
		CreatedBy:              record.User.ID,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create_failed", "message": err.Error()})
		return
	}
	// 主需求保持当前状态（TESTING 等），仅返回新建的 Bug 子需求
	writeJSON(w, http.StatusCreated, map[string]any{
		"bug":              bug,
		"main_requirement": parent,
	})
}

func (h *RequirementHandler) handleListBugs(w http.ResponseWriter, r *http.Request) {
	id, err := parsePathUint64(r, "id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	items, err := h.repo.ListBugsByRequirement(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list_failed", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *RequirementHandler) handleTimeline(w http.ResponseWriter, r *http.Request) {
	id, err := parsePathUint64(r, "id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	if _, err := h.repo.GetRequirement(r.Context(), id); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found", "message": err.Error()})
		return
	}
	timeline, err := h.repo.ListRequirementTimeline(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "timeline_failed", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, timeline)
}

// handleUpdateRegression allows changing a failed REGRESSION result to PASS.
func (h *RequirementHandler) handleUpdateRegression(w http.ResponseWriter, r *http.Request) {
	record, ok := sessionFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	id, err := parsePathUint64(r, "id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	var body struct {
		RegressionSummary string `json:"regression_summary"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	if err := h.repo.UpdateRegressionResult(r.Context(), id, record.User.ID, body.RegressionSummary); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "update_failed", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func parseOptionalDateTime(raw string) *time.Time {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	layouts := []string{
		time.RFC3339,
		"2006-01-02T15:04:05Z07:00",
		"2006-01-02",
	}
	for _, layout := range layouts {
		if parsed, err := time.Parse(layout, raw); err == nil {
			utc := parsed.UTC()
			return &utc
		}
	}
	return nil
}
