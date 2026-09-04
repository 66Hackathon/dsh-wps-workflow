package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

// RequirementStageSubmission is a persisted stage exit record.
type RequirementStageSubmission struct {
	ID             uint64         `json:"id"`
	RequirementID  uint64         `json:"requirement_id"`
	StageCode      string         `json:"stage_code"`
	Result         string         `json:"result,omitempty"`
	Content        map[string]any `json:"content,omitempty"`
	OperatorUserID uint64         `json:"operator_user_id"`
	OperatorName   string         `json:"operator_name,omitempty"`
	SubmittedAt    time.Time      `json:"submitted_at"`

	// Flattened content keys for older clients.
	SpecBody            *string `json:"spec_body,omitempty"`
	AcceptanceCriteria  *string `json:"acceptance_criteria,omitempty"`
	DevDesignDoc        *string `json:"dev_design_doc,omitempty"`
	DevSummary          *string `json:"dev_summary,omitempty"`
	ImplementationNotes *string `json:"implementation_notes,omitempty"`
	TestResult          *string `json:"test_result,omitempty"`
	TestSummary         *string `json:"test_summary,omitempty"`
	AcceptanceNote      *string `json:"acceptance_note,omitempty"`
	RegressionResult    *string `json:"regression_result,omitempty"`
	RegressionSummary   *string `json:"regression_summary,omitempty"`
	Remark              *string `json:"remark,omitempty"`
}

// StatusChangeLogEntry is one requirement status transition audit record.
type StatusChangeLogEntry struct {
	ID             uint64    `json:"id"`
	FromStatus     *string   `json:"from_status,omitempty"`
	ToStatus       string    `json:"to_status"`
	OperatorUserID uint64    `json:"operator_user_id"`
	OperatorName   string    `json:"operator_name,omitempty"`
	Remark         string    `json:"remark"`
	CreatedAt      time.Time `json:"created_at"`
}

// RequirementTimeline aggregates stage submissions and status changes.
type RequirementTimeline struct {
	StageSubmissions []RequirementStageSubmission `json:"stage_submissions"`
	StatusChanges    []StatusChangeLogEntry       `json:"status_changes"`
}

// ListRequirementTimeline returns stage submissions and status change log for a requirement.
func (r *Repository) ListRequirementTimeline(ctx context.Context, requirementID uint64) (RequirementTimeline, error) {
	submissions, err := r.listStageSubmissions(ctx, requirementID)
	if err != nil {
		return RequirementTimeline{}, err
	}
	changes, err := r.listRequirementStatusChanges(ctx, requirementID)
	if err != nil {
		return RequirementTimeline{}, err
	}
	return RequirementTimeline{
		StageSubmissions: submissions,
		StatusChanges:    changes,
	}, nil
}

func (r *Repository) listStageSubmissions(ctx context.Context, requirementID uint64) ([]RequirementStageSubmission, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, requirement_id, stage_code, IFNULL(result, ''), content,
		       operator_user_id, submitted_at
		FROM requirement_stage_submissions
		WHERE requirement_id = ?
		ORDER BY submitted_at ASC, id ASC`, requirementID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]RequirementStageSubmission, 0)
	operatorIDs := make([]uint64, 0)
	for rows.Next() {
		var item RequirementStageSubmission
		var contentRaw []byte
		if err := rows.Scan(
			&item.ID, &item.RequirementID, &item.StageCode, &item.Result, &contentRaw,
			&item.OperatorUserID, &item.SubmittedAt,
		); err != nil {
			return nil, err
		}
		if len(contentRaw) > 0 {
			_ = json.Unmarshal(contentRaw, &item.Content)
		}
		flattenStageContent(&item)
		items = append(items, item)
		operatorIDs = append(operatorIDs, item.OperatorUserID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	names, err := r.mapUserDisplayNames(ctx, operatorIDs)
	if err != nil {
		return nil, err
	}
	for i := range items {
		items[i].OperatorName = names[items[i].OperatorUserID]
	}
	return items, nil
}

func flattenStageContent(item *RequirementStageSubmission) {
	if item.Content == nil {
		return
	}
	item.SpecBody = contentStringPtr(item.Content, "spec_body")
	item.AcceptanceCriteria = contentStringPtr(item.Content, "acceptance_criteria")
	item.DevDesignDoc = contentStringPtr(item.Content, "dev_design_doc")
	item.DevSummary = contentStringPtr(item.Content, "dev_summary")
	item.ImplementationNotes = contentStringPtr(item.Content, "implementation_notes")
	item.TestResult = contentStringPtr(item.Content, "test_result")
	item.TestSummary = contentStringPtr(item.Content, "test_summary")
	item.AcceptanceNote = contentStringPtr(item.Content, "acceptance_note")
	item.RegressionResult = contentStringPtr(item.Content, "regression_result")
	item.RegressionSummary = contentStringPtr(item.Content, "regression_summary")
	item.Remark = contentStringPtr(item.Content, "remark")
}

func contentStringPtr(content map[string]any, key string) *string {
	raw, ok := content[key]
	if !ok || raw == nil {
		return nil
	}
	switch v := raw.(type) {
	case string:
		if v == "" {
			return nil
		}
		return &v
	default:
		return nil
	}
}

func (r *Repository) listRequirementStatusChanges(ctx context.Context, requirementID uint64) ([]StatusChangeLogEntry, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, from_status, to_status, operator_user_id, IFNULL(remark, ''), created_at
		FROM status_change_logs
		WHERE requirement_id = ?
		ORDER BY created_at ASC, id ASC`, requirementID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]StatusChangeLogEntry, 0)
	operatorIDs := make([]uint64, 0)
	for rows.Next() {
		var item StatusChangeLogEntry
		var from sql.NullString
		if err := rows.Scan(&item.ID, &from, &item.ToStatus, &item.OperatorUserID, &item.Remark, &item.CreatedAt); err != nil {
			return nil, err
		}
		assignNullString(&item.FromStatus, from)
		items = append(items, item)
		operatorIDs = append(operatorIDs, item.OperatorUserID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	names, err := r.mapUserDisplayNames(ctx, operatorIDs)
	if err != nil {
		return nil, err
	}
	for i := range items {
		items[i].OperatorName = names[items[i].OperatorUserID]
	}
	return items, nil
}

func assignNullString(target **string, value sql.NullString) {
	if !value.Valid {
		*target = nil
		return
	}
	v := value.String
	*target = &v
}

func assignNullUint64(target **uint64, value sql.NullInt64) {
	if !value.Valid {
		*target = nil
		return
	}
	v := uint64(value.Int64)
	*target = &v
}
