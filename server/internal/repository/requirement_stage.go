package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/domain"
)

// StageSubmissionInput is the HTTP/API payload for exiting a stage.
// It maps 1:1 onto domain.StageSubmissionInput and is stored as JSON content.
type StageSubmissionInput struct {
	SpecBody               string         `json:"spec_body,omitempty"`
	AcceptanceCriteria     string         `json:"acceptance_criteria,omitempty"`
	DevDesignDoc           string         `json:"dev_design_doc,omitempty"`
	DevelopmentType        string         `json:"development_type,omitempty"`
	DevSummary             string         `json:"dev_summary,omitempty"`
	ImplementationNotes    string         `json:"implementation_notes,omitempty"`
	DeveloperUserID        uint64         `json:"developer_user_id,omitempty"`
	BackendDeveloperUserID uint64         `json:"backend_developer_user_id,omitempty"` // ignored; kept for old clients
	ReturnReason           string         `json:"return_reason,omitempty"`
	TestResult             string         `json:"test_result,omitempty"`
	TestSummary            string         `json:"test_summary,omitempty"`
	TestCasesCovered       string         `json:"test_cases_covered,omitempty"`
	TesterUserID           uint64         `json:"tester_user_id,omitempty"`
	AcceptanceNote         string         `json:"acceptance_note,omitempty"`
	AcceptResult           string         `json:"accept_result,omitempty"`
	RegressionResult       string         `json:"regression_result,omitempty"`
	RegressionSummary      string         `json:"regression_summary,omitempty"`
	Remark                 string         `json:"remark,omitempty"`
	Extra                  map[string]any `json:"extra,omitempty"`
}

func (s StageSubmissionInput) toDomain() domain.StageSubmissionInput {
	return domain.StageSubmissionInput{
		SpecBody:            s.SpecBody,
		AcceptanceCriteria:  s.AcceptanceCriteria,
		DevDesignDoc:        s.DevDesignDoc,
		DevelopmentType:     s.DevelopmentType,
		DevSummary:          s.DevSummary,
		ImplementationNotes: s.ImplementationNotes,
		DeveloperUserID:     s.DeveloperUserID,
		ReturnReason:        s.ReturnReason,
		TestResult:          s.TestResult,
		TestSummary:         s.TestSummary,
		TestCasesCovered:    s.TestCasesCovered,
		TesterUserID:        s.TesterUserID,
		AcceptanceNote:      s.AcceptanceNote,
		AcceptResult:        s.AcceptResult,
		RegressionResult:    s.RegressionResult,
		RegressionSummary:   s.RegressionSummary,
		Remark:              s.Remark,
		Extra:               s.Extra,
	}
}

type stageSubmissionRow struct {
	RequirementID  uint64
	StageCode      string
	Result         string
	Content        map[string]any
	OperatorUserID uint64
}

func insertStageSubmission(ctx context.Context, tx *sql.Tx, row stageSubmissionRow) (uint64, error) {
	var contentJSON any
	if len(row.Content) > 0 {
		raw, err := json.Marshal(row.Content)
		if err != nil {
			return 0, err
		}
		contentJSON = raw
	}
	result := strings.TrimSpace(row.Result)
	now := time.Now().UTC()
	res, err := tx.ExecContext(ctx, `
		INSERT INTO requirement_stage_submissions (
			requirement_id, stage_code, result, content,
			operator_user_id, submitted_at
		) VALUES (?, ?, ?, ?, ?, ?)`,
		row.RequirementID, row.StageCode, nullIfEmpty(result), contentJSON,
		row.OperatorUserID, now)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, err
	}
	return uint64(id), nil
}

type statusChangeLogEntry struct {
	RequirementID     uint64
	FromStatus        *string
	ToStatus          string
	OperatorUserID    uint64
	StageSubmissionID uint64
	Remark            string
}

func insertStatusChangeLog(ctx context.Context, tx *sql.Tx, entry statusChangeLogEntry) error {
	var from any
	if entry.FromStatus != nil {
		from = *entry.FromStatus
	}
	var submissionID any
	if entry.StageSubmissionID > 0 {
		submissionID = entry.StageSubmissionID
	}
	_, err := tx.ExecContext(ctx, `
		INSERT INTO status_change_logs (
			requirement_id, from_status, to_status,
			operator_user_id, stage_submission_id, remark
		) VALUES (?, ?, ?, ?, ?, ?)`,
		entry.RequirementID, from, entry.ToStatus,
		entry.OperatorUserID, submissionID, nullIfEmpty(entry.Remark))
	return err
}

func nullUint64(v uint64) any {
	if v == 0 {
		return nil
	}
	return v
}
