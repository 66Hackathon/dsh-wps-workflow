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

func (h *RequirementHandler) handleTransitionRules(w http.ResponseWriter, r *http.Request) {
	rules, err := h.repo.ListRequirementTransitionRules(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list_failed", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": rules})
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
		RequirementCode    string `json:"requirement_code"`
		Title              string `json:"title"`
		Description        string `json:"description"`
		Priority           string `json:"priority"`
		DevelopmentScope   string `json:"development_scope"`
		RequirementType    string `json:"requirement_type"`
		AcceptanceCriteria string `json:"acceptance_criteria"`
		ProductOwnerUserID uint64 `json:"product_owner_user_id"`
		PlannedStartAt     string `json:"planned_start_at"`
		PlannedEndAt       string `json:"planned_end_at"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	if body.RequirementCode == "" || body.Title == "" || body.Description == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing_fields", "message": "requirement_code, title and description are required"})
		return
	}

	scope := body.DevelopmentScope
	if scope == "" {
		scope = body.RequirementType
	}

	item, err := h.repo.CreateRequirement(r.Context(), repository.CreateRequirementInput{
		ProjectID:          projectID,
		RequirementCode:    body.RequirementCode,
		Title:              body.Title,
		Description:        body.Description,
		Priority:           body.Priority,
		DevelopmentScope:   scope,
		AcceptanceCriteria: body.AcceptanceCriteria,
		ProductOwnerUserID: body.ProductOwnerUserID,
		PlannedStartAt:     parseOptionalDateTime(body.PlannedStartAt),
		PlannedEndAt:       parseOptionalDateTime(body.PlannedEndAt),
		CreatedBy:          record.User.ID,
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
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "transition_failed", "message": err.Error()})
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
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}

	result, err := h.repo.CompleteDevelopmentTrack(
		r.Context(),
		id,
		record.User.ID,
		body.DevSummary,
		body.ImplementationNotes,
	)
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "permission denied") {
			status = http.StatusForbidden
		}
		writeJSON(w, status, map[string]string{"error": "development_complete_failed", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
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

func (h *RequirementHandler) handleListChildren(w http.ResponseWriter, r *http.Request) {
	id, err := parsePathUint64(r, "id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	items, err := h.repo.ListChildRequirements(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list_failed", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *RequirementHandler) handleCompleteBugFix(w http.ResponseWriter, r *http.Request) {
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

	req, bug, err := h.repo.CompleteBugFix(r.Context(), id, record.User.ID, body.DevSummary, body.ImplementationNotes)
	if err != nil {
		msg := err.Error()
		status := http.StatusBadRequest
		if strings.Contains(msg, "permission denied") {
			status = http.StatusForbidden
		}
		writeJSON(w, status, map[string]string{"error": "complete_failed", "message": msg})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"requirement": req,
		"bug":         bug,
	})
}

func (h *RequirementHandler) handleResumeTesting(w http.ResponseWriter, r *http.Request) {
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
		Remark string `json:"remark"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	item, err := h.repo.ResumeTestingFromBugFix(r.Context(), id, record.User.ID, body.Remark)
	if err != nil {
		msg := err.Error()
		status := http.StatusBadRequest
		if strings.Contains(msg, "permission denied") {
			status = http.StatusForbidden
		}
		writeJSON(w, status, map[string]string{"error": "resume_failed", "message": msg})
		return
	}
	writeJSON(w, http.StatusOK, item)
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
