package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/domain"
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
		Title           string `json:"title"`
		Description     string `json:"description"`
		Priority        string `json:"priority"`
		DevelopmentType string `json:"development_type"`
		DevDirections   string `json:"dev_directions"` // legacy alias
		DeveloperUserID uint64 `json:"developer_user_id"`
		TesterUserID    uint64 `json:"tester_user_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	if strings.TrimSpace(body.Title) == "" || strings.TrimSpace(body.Description) == "" {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "missing_fields", "message": "title and description are required"})
		return
	}
	developmentType := body.DevelopmentType
	if developmentType == "" {
		developmentType = body.DevDirections
	}

	item, err := h.repo.CreateRequirement(c.Request.Context(), repository.CreateRequirementInput{
		ProjectID:       projectID,
		Title:           body.Title,
		Description:     body.Description,
		Priority:        body.Priority,
		DevelopmentType: developmentType,
		DeveloperUserID: body.DeveloperUserID,
		TesterUserID:    body.TesterUserID,
		CreatedBy:       record.User.ID,
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

// handleCompleteDevelopment is a convenience wrapper around transition to TESTING.
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
		DeveloperUserID     uint64 `json:"developer_user_id"`
	}
	_ = c.ShouldBindJSON(&body)

	item, err := h.repo.TransitionRequirementStatus(c.Request.Context(), id, record.User.ID, domain.StatusTesting, repository.StageSubmissionInput{
		DevSummary:          body.DevSummary,
		ImplementationNotes: body.ImplementationNotes,
		DeveloperUserID:     body.DeveloperUserID,
	})
	if err != nil {
		msg := err.Error()
		status := http.StatusBadRequest
		if strings.Contains(msg, "only the assigned") || strings.Contains(msg, "permission denied") {
			status = http.StatusForbidden
		}
		writeJSON(c, status, map[string]string{"error": "complete_development_failed", "message": msg})
		return
	}
	writeJSON(c, http.StatusOK, item)
}

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
		Title            string `json:"title"`
		Description      string `json:"description"`
		Priority         string `json:"priority"`
		SourceStageCode  string `json:"source_stage_code"`
		TriggeredAtStage string `json:"triggered_at_stage"` // legacy alias
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	if strings.TrimSpace(body.Title) == "" {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "missing_fields", "message": "title is required"})
		return
	}

	parent, err := h.repo.GetRequirement(c.Request.Context(), parentID)
	if err != nil {
		writeJSON(c, http.StatusNotFound, map[string]string{"error": "parent_not_found"})
		return
	}
	if parent.TesterUserID == nil || *parent.TesterUserID != record.User.ID {
		writeJSON(c, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "only the assigned tester can create a bug sub-item"})
		return
	}

	var devID, testerID uint64
	if parent.DeveloperUserID != nil {
		devID = *parent.DeveloperUserID
	}
	if parent.TesterUserID != nil {
		testerID = *parent.TesterUserID
	}
	developmentType := ""
	if parent.DevelopmentType != nil {
		developmentType = *parent.DevelopmentType
	}
	sourceStage := body.SourceStageCode
	if sourceStage == "" {
		sourceStage = body.TriggeredAtStage
	}
	if sourceStage == "" {
		sourceStage = parent.CurrentStatus
	}

	bug, err := h.repo.CreateBugItem(c.Request.Context(), repository.CreateBugItemInput{
		ProjectID:           parent.ProjectID,
		Title:               strings.TrimSpace(body.Title),
		Description:         body.Description,
		Priority:            body.Priority,
		ParentRequirementID: parentID,
		SourceStageCode:     sourceStage,
		DevelopmentType:     developmentType,
		DeveloperUserID:     devID,
		TesterUserID:        testerID,
		CreatedBy:           record.User.ID,
	})
	if err != nil {
		writeJSON(c, http.StatusInternalServerError, map[string]string{"error": "create_failed", "message": err.Error()})
		return
	}
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
