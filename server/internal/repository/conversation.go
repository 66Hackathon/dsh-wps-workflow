package repository

import (
	"context"
	"database/sql"
	"fmt"
)

// Conversation is a conversation row.
type Conversation struct {
	ID               uint64  `json:"id"`
	ProjectID        uint64  `json:"project_id"`
	RequirementID    *uint64 `json:"requirement_id,omitempty"`
	BugID            *uint64 `json:"bug_id,omitempty"`
	CreatorUserID    uint64  `json:"creator_user_id"`
	Title            string  `json:"title"`
	ConversationType string  `json:"conversation_type"`
	Status           string  `json:"status"`
}

// ConversationMessage is a message row.
type ConversationMessage struct {
	ID             uint64  `json:"id"`
	ConversationID uint64  `json:"conversation_id"`
	Role           string  `json:"role"`
	Content        string  `json:"content"`
	Status         string  `json:"status"`
	ModelName      *string `json:"model_name,omitempty"`
	ErrorMessage   *string `json:"error_message,omitempty"`
	CreatedBy      *uint64 `json:"created_by,omitempty"`
	CreatedAt      string  `json:"created_at"`
}

// ListConversations returns conversations for a project.
func (r *Repository) ListConversations(ctx context.Context, projectID uint64) ([]Conversation, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, project_id, requirement_id, bug_id, creator_user_id, title, conversation_type, status
		FROM conversation
		WHERE project_id = ? AND status = 'ACTIVE'
		ORDER BY updated_at DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]Conversation, 0)
	for rows.Next() {
		var item Conversation
		var reqID, bugID sql.NullInt64
		if err := rows.Scan(
			&item.ID, &item.ProjectID, &reqID, &bugID, &item.CreatorUserID,
			&item.Title, &item.ConversationType, &item.Status,
		); err != nil {
			return nil, err
		}
		if reqID.Valid {
			v := uint64(reqID.Int64)
			item.RequirementID = &v
		}
		if bugID.Valid {
			v := uint64(bugID.Int64)
			item.BugID = &v
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// GetConversation returns a conversation by id.
func (r *Repository) GetConversation(ctx context.Context, conversationID uint64) (Conversation, error) {
	var item Conversation
	var reqID, bugID sql.NullInt64
	err := r.db.QueryRowContext(ctx, `
		SELECT id, project_id, requirement_id, bug_id, creator_user_id, title, conversation_type, status
		FROM conversation WHERE id = ?`, conversationID).
		Scan(
			&item.ID, &item.ProjectID, &reqID, &bugID, &item.CreatorUserID,
			&item.Title, &item.ConversationType, &item.Status,
		)
	if err != nil {
		if err == sql.ErrNoRows {
			return Conversation{}, fmt.Errorf("conversation not found")
		}
		return Conversation{}, err
	}
	if reqID.Valid {
		v := uint64(reqID.Int64)
		item.RequirementID = &v
	}
	if bugID.Valid {
		v := uint64(bugID.Int64)
		item.BugID = &v
	}
	return item, nil
}

// CreateConversationInput holds fields for creating a conversation.
type CreateConversationInput struct {
	ProjectID        uint64
	RequirementID    *uint64
	BugID            *uint64
	CreatorUserID    uint64
	Title            string
	ConversationType string
}

// CreateConversation inserts a new conversation.
func (r *Repository) CreateConversation(ctx context.Context, input CreateConversationInput) (Conversation, error) {
	convType := input.ConversationType
	if convType == "" {
		convType = "GENERAL"
	}

	var reqID, bugID any
	if input.RequirementID != nil {
		reqID = *input.RequirementID
	}
	if input.BugID != nil {
		bugID = *input.BugID
	}

	result, err := r.db.ExecContext(ctx, `
		INSERT INTO conversation (project_id, requirement_id, bug_id, creator_user_id, title, conversation_type, status)
		VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')`,
		input.ProjectID, reqID, bugID, input.CreatorUserID, input.Title, convType)
	if err != nil {
		return Conversation{}, err
	}
	insertedID, err := result.LastInsertId()
	if err != nil {
		return Conversation{}, err
	}

	return Conversation{
		ID:               uint64(insertedID),
		ProjectID:        input.ProjectID,
		RequirementID:    input.RequirementID,
		BugID:            input.BugID,
		CreatorUserID:    input.CreatorUserID,
		Title:            input.Title,
		ConversationType: convType,
		Status:           "ACTIVE",
	}, nil
}

// ListConversationMessages returns messages for a conversation.
func (r *Repository) ListConversationMessages(ctx context.Context, conversationID uint64) ([]ConversationMessage, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, conversation_id, role, content, status, model_name, error_message, created_by,
		       DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ')
		FROM conversation_message
		WHERE conversation_id = ?
		ORDER BY id ASC`, conversationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]ConversationMessage, 0)
	for rows.Next() {
		var item ConversationMessage
		var modelName, errMsg sql.NullString
		var createdBy sql.NullInt64
		if err := rows.Scan(
			&item.ID, &item.ConversationID, &item.Role, &item.Content, &item.Status,
			&modelName, &errMsg, &createdBy, &item.CreatedAt,
		); err != nil {
			return nil, err
		}
		if modelName.Valid {
			item.ModelName = &modelName.String
		}
		if errMsg.Valid {
			item.ErrorMessage = &errMsg.String
		}
		if createdBy.Valid {
			v := uint64(createdBy.Int64)
			item.CreatedBy = &v
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// CreateConversationMessageInput holds fields for creating a message.
type CreateConversationMessageInput struct {
	ConversationID uint64
	Role           string
	Content        string
	Status         string
	ModelName      *string
	CreatedBy      *uint64
}

// CreateConversationMessage inserts a message.
func (r *Repository) CreateConversationMessage(ctx context.Context, input CreateConversationMessageInput) (ConversationMessage, error) {
	status := input.Status
	if status == "" {
		status = "COMPLETED"
	}

	var createdBy any
	if input.CreatedBy != nil {
		createdBy = *input.CreatedBy
	}

	result, err := r.db.ExecContext(ctx, `
		INSERT INTO conversation_message (conversation_id, role, content, status, model_name, created_by)
		VALUES (?, ?, ?, ?, ?, ?)`,
		input.ConversationID, input.Role, input.Content, status, input.ModelName, createdBy)
	if err != nil {
		return ConversationMessage{}, err
	}
	insertedID, err := result.LastInsertId()
	if err != nil {
		return ConversationMessage{}, err
	}

	_, _ = r.db.ExecContext(ctx, `UPDATE conversation SET updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`, input.ConversationID)

	return ConversationMessage{
		ID:             uint64(insertedID),
		ConversationID: input.ConversationID,
		Role:           input.Role,
		Content:        input.Content,
		Status:         status,
		ModelName:      input.ModelName,
		CreatedBy:      input.CreatedBy,
	}, nil
}
