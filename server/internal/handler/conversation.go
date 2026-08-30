package handler

import (
	"encoding/json"
	"net/http"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/repository"
)

// ConversationHandler serves conversation endpoints.
type ConversationHandler struct {
	repo *repository.Repository
	auth *AuthHandler
	ai   *AIHandler
}

func NewConversationHandler(repo *repository.Repository, auth *AuthHandler, ai *AIHandler) *ConversationHandler {
	return &ConversationHandler{repo: repo, auth: auth, ai: ai}
}

func (h *ConversationHandler) handleList(w http.ResponseWriter, r *http.Request) {
	projectID, err := parsePathUint64(r, "projectId")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_project_id"})
		return
	}
	items, err := h.repo.ListConversations(r.Context(), projectID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list_failed", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *ConversationHandler) handleCreate(w http.ResponseWriter, r *http.Request) {
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
		Title            string  `json:"title"`
		ConversationType string  `json:"conversation_type"`
		RequirementID    *uint64 `json:"requirement_id"`
		BugID            *uint64 `json:"bug_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Title == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_body"})
		return
	}

	item, err := h.repo.CreateConversation(r.Context(), repository.CreateConversationInput{
		ProjectID:        projectID,
		RequirementID:    body.RequirementID,
		BugID:            body.BugID,
		CreatorUserID:    record.User.ID,
		Title:            body.Title,
		ConversationType: body.ConversationType,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create_failed", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (h *ConversationHandler) handleGet(w http.ResponseWriter, r *http.Request) {
	id, err := parsePathUint64(r, "id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	item, err := h.repo.GetConversation(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (h *ConversationHandler) handleListMessages(w http.ResponseWriter, r *http.Request) {
	id, err := parsePathUint64(r, "id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}
	items, err := h.repo.ListConversationMessages(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list_failed", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *ConversationHandler) handleSendMessage(w http.ResponseWriter, r *http.Request) {
	record, ok := sessionFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	conversationID, err := parsePathUint64(r, "id")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}

	conv, err := h.repo.GetConversation(r.Context(), conversationID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found"})
		return
	}

	var body struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Content == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing_content"})
		return
	}

	userID := record.User.ID
	userMsg, err := h.repo.CreateConversationMessage(r.Context(), repository.CreateConversationMessageInput{
		ConversationID: conversationID,
		Role:           "USER",
		Content:        body.Content,
		Status:         "COMPLETED",
		CreatedBy:      &userID,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "save_user_message_failed"})
		return
	}

	aiResult := h.ai.GenerateStub(r.Context(), AIRequest{
		UserID:         record.User.ID,
		ProjectID:      conv.ProjectID,
		ConversationID: conversationID,
		Message:        body.Content,
	})

	modelName := "stub"
	assistantMsg, err := h.repo.CreateConversationMessage(r.Context(), repository.CreateConversationMessageInput{
		ConversationID: conversationID,
		Role:           "ASSISTANT",
		Content:        aiResult.Answer,
		Status:         "COMPLETED",
		ModelName:      &modelName,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "save_assistant_message_failed"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"user_message":      userMsg,
		"assistant_message": assistantMsg,
		"ai":                aiResult,
	})
}
