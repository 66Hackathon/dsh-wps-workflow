package handler

import (
	"github.com/gin-gonic/gin"

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

func (h *RequirementHandler) handleList(c *gin.Context) {
	projectID, err := parsePathUint64(c, "id")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
		return
	}
	items, err := h.repo.ListRequirements(c.Request.Context(), projectID)
	if err != nil {
		writeJSON(c, http.StatusInternalServerError, map[string]string{"error": "list_failed", "message": err.Error()})
		return
	}
	writeJSON(c, http.StatusOK, map[string]any{"items": items})
}

func (h *RequirementHandler) handleGet(c *gin.Context) {
	id, err := parsePathUint64(c, "id")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	item, err := h.repo.GetRequirement(c.Request.Context(), id)
	if err != nil {
		writeJSON(c, http.StatusNotFound, map[string]string{"error": "not_found", "message": err.Error()})
		return
	}
	writeJSON(c, http.StatusOK, item)
}

func (h *RequirementHandler) handleUpdate(c *gin.Context) {
	record, ok := sessionFromContext(c.Request.Context())
	if !ok {
		writeJSON(c, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	id, err := parsePathUint64(c, "id")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}

	var body struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		Priority    string `json:"priority"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}

	item, err := h.repo.UpdateRequirementContent(c.Request.Context(), id, record.User.ID, repository.UpdateRequirementContentInput{
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
		writeJSON(c, status, map[string]string{"error": "update_failed", "message": msg})
		return
	}
	writeJSON(c, http.StatusOK, item)
}

func (h *RequirementHandler) handleCreate(c *gin.Context) {
	record, ok := sessionFromContext(c.Request.Context())
	if !ok {
		writeJSON(c, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	projectID, err := parsePathUint64(c, "id")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
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
	if err := c.ShouldBindJSON(&body); err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	if body.RequirementCode == "" || body.Title == "" || body.Description == "" {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "missing_fields", "message": "requirement_code, title and description are required"})
		return
	}

	item, err := h.repo.CreateRequirement(c.Request.Context(), repository.CreateRequirementInput{
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
		writeJSON(c, http.StatusInternalServerError, map[string]string{"error": "create_failed", "message": err.Error()})
		return
	}
	writeJSON(c, http.StatusCreated, item)
}

func (h *RequirementHandler) handleTransition(c *gin.Context) {
	record, ok := sessionFromContext(c.Request.Context())
	if !ok {
		writeJSON(c, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	id, err := parsePathUint64(c, "id")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}

	var body struct {
		ToStatus        string                          `json:"to_status"`
		StageSubmission repository.StageSubmissionInput `json:"stage_submission"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.ToStatus == "" {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "missing_to_status"})
		return
	}

	item, err := h.repo.TransitionRequirementStatus(c.Request.Context(), id, record.User.ID, body.ToStatus, body.StageSubmission)
	if err != nil {
		msg := err.Error()
		status := http.StatusBadRequest
		if strings.Contains(msg, "permission denied") {
			status = http.StatusForbidden
		}
		writeJSON(c, status, map[string]string{"error": "transition_failed", "message": msg})
		return
	}
	writeJSON(c, http.StatusOK, item)
}

func (h *RequirementHandler) handleCompleteDevelopment(c *gin.Context) {
	record, ok := sessionFromContext(c.Request.Context())
	if !ok {
		writeJSON(c, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	id, err := parsePathUint64(c, "id")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}

	var body struct {
		DevSummary          string `json:"dev_summary"`
		ImplementationNotes string `json:"implementation_notes"`
	}
	_ = c.ShouldBindJSON(&body)

	result, err := h.repo.CompleteDevelopment(
		c.Request.Context(), id, record.User.ID, body.DevSummary, body.ImplementationNotes,
	)
	if err != nil {
		msg := err.Error()
		status := http.StatusBadRequest
		if strings.Contains(msg, "only the assigned") {
			status = http.StatusForbidden
		}
		writeJSON(c, status, map[string]string{"error": "complete_development_failed", "message": msg})
		return
	}
	writeJSON(c, http.StatusOK, result)
}

// handleCreateBug creates a Bug sub-item under a parent requirement.
// The bug inherits developer/tester from the parent, starts at DEVELOPMENT.
func (h *RequirementHandler) handleCreateBug(c *gin.Context) {
	record, ok := sessionFromContext(c.Request.Context())
	if !ok {
		writeJSON(c, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	parentID, err := parsePathUint64(c, "id")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}

	var body struct {
		RequirementCode  string `json:"requirement_code"`
		Title            string `json:"title"`
		Description      string `json:"description"`
		Priority         string `json:"priority"`
		TriggeredAtStage string `json:"triggered_at_stage"` // TESTING / REGRESSION
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	if body.RequirementCode == "" || strings.TrimSpace(body.Title) == "" {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "missing_fields", "message": "requirement_code and title are required"})
		return
	}

	// Fetch parent to inherit developer/tester
	parent, err := h.repo.GetRequirement(c.Request.Context(), parentID)
	if err != nil {
		writeJSON(c, http.StatusNotFound, map[string]string{"error": "parent_not_found"})
		return
	}

	// Validate that creator is the tester (only tester can create a bug sub-item)
	if parent.TesterUserID == nil || *parent.TesterUserID != record.User.ID {
		writeJSON(c, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "only the assigned tester can create a bug sub-item"})
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

	bug, err := h.repo.CreateBugItem(c.Request.Context(), repository.CreateBugItemInput{
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
		writeJSON(c, http.StatusInternalServerError, map[string]string{"error": "create_failed", "message": err.Error()})
		return
	}
	// 主需求保持当前状态（TESTING 等），仅返回新建的 Bug 子需求
	writeJSON(c, http.StatusCreated, map[string]any{
		"bug":              bug,
		"main_requirement": parent,
	})
}

func (h *RequirementHandler) handleListBugs(c *gin.Context) {
	id, err := parsePathUint64(c, "id")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	items, err := h.repo.ListBugsByRequirement(c.Request.Context(), id)
	if err != nil {
		writeJSON(c, http.StatusInternalServerError, map[string]string{"error": "list_failed", "message": err.Error()})
		return
	}
	writeJSON(c, http.StatusOK, map[string]any{"items": items})
}

func (h *RequirementHandler) handleTimeline(c *gin.Context) {
	id, err := parsePathUint64(c, "id")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	if _, err := h.repo.GetRequirement(c.Request.Context(), id); err != nil {
		writeJSON(c, http.StatusNotFound, map[string]string{"error": "not_found", "message": err.Error()})
		return
	}
	timeline, err := h.repo.ListRequirementTimeline(c.Request.Context(), id)
	if err != nil {
		writeJSON(c, http.StatusInternalServerError, map[string]string{"error": "timeline_failed", "message": err.Error()})
		return
	}
	writeJSON(c, http.StatusOK, timeline)
}

// handleUpdateRegression allows changing a failed REGRESSION result to PASS.
func (h *RequirementHandler) handleUpdateRegression(c *gin.Context) {
	record, ok := sessionFromContext(c.Request.Context())
	if !ok {
		writeJSON(c, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	id, err := parsePathUint64(c, "id")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	var body struct {
		RegressionSummary string `json:"regression_summary"`
	}
	_ = c.ShouldBindJSON(&body)

	if err := h.repo.UpdateRegressionResult(c.Request.Context(), id, record.User.ID, body.RegressionSummary); err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "update_failed", "message": err.Error()})
		return
	}
	writeJSON(c, http.StatusOK, map[string]string{"status": "ok"})
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
