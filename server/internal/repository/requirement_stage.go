package repository

import (
	"context"
	"strings"
	"time"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/domain"
)

// StageSubmissionInput holds stage exit payload for a requirement transition.
type StageSubmissionInput struct {
	// PRODUCT_DESIGN
	SpecBody           string `json:"spec_body,omitempty"`
	AcceptanceCriteria string `json:"acceptance_criteria,omitempty"`

	// DEV_DESIGN
	DevDesignDoc string `json:"dev_design_doc,omitempty"`

	// DEVELOPMENT
	DevSummary             string `json:"dev_summary,omitempty"`
	ImplementationNotes    string `json:"implementation_notes,omitempty"`
	DeveloperUserID        uint64 `json:"developer_user_id,omitempty"`
	BackendDeveloperUserID uint64 `json:"backend_developer_user_id,omitempty"`

	// TESTING / PRODUCT_ACCEPTANCE 退回原因
	ReturnReason string `json:"return_reason,omitempty"`

	// TESTING
	TestResult       string `json:"test_result,omitempty"` // PASS / FAIL / SUBMIT_BUG
	TestSummary      string `json:"test_summary,omitempty"`
	TestCasesCovered string `json:"test_cases_covered,omitempty"`
	TesterUserID     uint64 `json:"tester_user_id,omitempty"`

	// PRODUCT_ACCEPTANCE
	AcceptanceNote string `json:"acceptance_note,omitempty"`
	AcceptResult   string `json:"accept_result,omitempty"` // PASS / FAIL

	// REGRESSION
	RegressionResult  string `json:"regression_result,omitempty"` // PASS / FAIL
	RegressionSummary string `json:"regression_summary,omitempty"`

	// 通用
	Remark string `json:"remark,omitempty"`
}

// UpsertStageSubmission persists stage submission and returns its id.
func (r *Repository) UpsertStageSubmission(
	ctx context.Context,
	requirementID uint64,
	stageCode string,
	operatorID uint64,
	sub StageSubmissionInput,
) (uint64, error) {
	sub.TestResult = strings.ToUpper(strings.TrimSpace(sub.TestResult))
	sub.AcceptResult = strings.ToUpper(strings.TrimSpace(sub.AcceptResult))
	sub.RegressionResult = strings.ToUpper(strings.TrimSpace(sub.RegressionResult))
	now := time.Now().UTC()

	result, err := r.db.ExecContext(ctx, `
		INSERT INTO requirement_stage_submissions (
			requirement_id, stage_code,
			spec_body, acceptance_criteria,
			dev_design_doc,
			dev_summary, implementation_notes, developer_user_id,
			return_reason,
			test_result, test_summary, test_cases_covered, tester_user_id,
			acceptance_note,
			regression_result, regression_summary,
			operator_user_id, submitted_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			spec_body              = VALUES(spec_body),
			acceptance_criteria    = VALUES(acceptance_criteria),
			dev_design_doc         = VALUES(dev_design_doc),
			dev_summary            = VALUES(dev_summary),
			implementation_notes   = VALUES(implementation_notes),
			developer_user_id      = VALUES(developer_user_id),
			return_reason          = VALUES(return_reason),
			test_result            = VALUES(test_result),
			test_summary           = VALUES(test_summary),
			test_cases_covered     = VALUES(test_cases_covered),
			tester_user_id         = VALUES(tester_user_id),
			acceptance_note        = VALUES(acceptance_note),
			regression_result      = VALUES(regression_result),
			regression_summary     = VALUES(regression_summary),
			operator_user_id       = VALUES(operator_user_id),
			submitted_at           = VALUES(submitted_at),
			updated_at             = CURRENT_TIMESTAMP(3)`,
		requirementID, stageCode,
		nullIfEmpty(sub.SpecBody), nullIfEmpty(sub.AcceptanceCriteria),
		nullIfEmpty(sub.DevDesignDoc),
		nullIfEmpty(sub.DevSummary), nullIfEmpty(sub.ImplementationNotes), nullUint64(sub.DeveloperUserID),
		nullIfEmpty(sub.ReturnReason),
		nullIfEmpty(sub.TestResult), nullIfEmpty(sub.TestSummary), nullIfEmpty(sub.TestCasesCovered), nullUint64(sub.TesterUserID),
		nullIfEmpty(sub.AcceptanceNote),
		nullIfEmpty(sub.RegressionResult), nullIfEmpty(sub.RegressionSummary),
		operatorID, now,
	)
	if err != nil {
		return 0, err
	}
	insertedID, err := result.LastInsertId()
	if err != nil || insertedID == 0 {
		var id uint64
		err = r.db.QueryRowContext(ctx, `
			SELECT id FROM requirement_stage_submissions
			WHERE requirement_id = ? AND stage_code = ?`, requirementID, stageCode).Scan(&id)
		if err != nil {
			return 0, err
		}
		return id, nil
	}
	return uint64(insertedID), nil
}

func toDomainSubmission(sub StageSubmissionInput) domain.StageSubmissionInput {
	return domain.StageSubmissionInput{
		SpecBody:            sub.SpecBody,
		AcceptanceCriteria:  sub.AcceptanceCriteria,
		DevDesignDoc:        sub.DevDesignDoc,
		DevSummary:          sub.DevSummary,
		ImplementationNotes: sub.ImplementationNotes,
		DeveloperUserID:     sub.DeveloperUserID,
		ReturnReason:        sub.ReturnReason,
		TestResult:          sub.TestResult,
		TestSummary:         sub.TestSummary,
		TestCasesCovered:    sub.TestCasesCovered,
		TesterUserID:        sub.TesterUserID,
		AcceptanceNote:      sub.AcceptanceNote,
		AcceptResult:        sub.AcceptResult,
		RegressionResult:    sub.RegressionResult,
		RegressionSummary:   sub.RegressionSummary,
		Remark:              sub.Remark,
	}
}

func nullUint64(v uint64) any {
	if v == 0 {
		return nil
	}
	return v
}
