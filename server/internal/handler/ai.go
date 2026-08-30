package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

// AIRequest is the payload sent to DSH SDK (reserved).
type AIRequest struct {
	UserID         uint64  `json:"user_id"`
	ProjectID      uint64  `json:"project_id"`
	RequirementID  *uint64 `json:"requirement_id,omitempty"`
	ConversationID uint64  `json:"conversation_id"`
	Message        string  `json:"message"`
}

// AIResponse mirrors the expected DSH SDK response shape.
type AIResponse struct {
	Answer     string         `json:"answer"`
	References []any          `json:"references"`
	ToolCalls  []any          `json:"tool_calls"`
	Usage      map[string]any `json:"usage"`
	Stub       bool           `json:"stub"`
}

// AIHandler provides AI endpoints (stub only in phase 1).
type AIHandler struct{}

func NewAIHandler() *AIHandler {
	return &AIHandler{}
}

func (h *AIHandler) handleRun(w http.ResponseWriter, r *http.Request) {
	var req AIRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Message == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_body"})
		return
	}
	writeJSON(w, http.StatusOK, h.GenerateStub(r.Context(), req))
}

// GenerateStub returns a placeholder AI response without calling DSH.
func (h *AIHandler) GenerateStub(_ context.Context, req AIRequest) AIResponse {
	return AIResponse{
		Answer: fmt.Sprintf(
			"【AI 预留】已收到消息：「%s」。DSH SDK 尚未接入，当前为架构演示 stub 回复。",
			req.Message,
		),
		References: []any{},
		ToolCalls:  []any{},
		Usage:      map[string]any{"stub": true},
		Stub:       true,
	}
}
