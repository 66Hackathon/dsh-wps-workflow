package repository

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/domain"
)

// StageSubmissionInput holds stage exit payload for a requirement transition.
type StageSubmissionInput struct {
	SpecBody               string `json:"spec_body,omitempty"`
	AcceptanceCriteria     string `json:"acceptance_criteria,omitempty"`
	ProductOwnerUserID     uint64 `json:"product_owner_user_id,omitempty"`
	ReviewResult           string `json:"review_result,omitempty"`
	ReviewComment          string `json:"review_comment,omitempty"`
	ReviewerUserID         uint64 `json:"reviewer_user_id,omitempty"`
	DevSummary             string `json:"dev_summary,omitempty"`
	ImplementationNotes    string `json:"implementation_notes,omitempty"`
	DeveloperUserID        uint64 `json:"developer_user_id,omitempty"`
	BackendDeveloperUserID uint64 `json:"backend_developer_user_id,omitempty"`
	TestSummary            string `json:"test_summary,omitempty"`
	TestCasesCovered       string `json:"test_cases_covered,omitempty"`
	TestResult             string `json:"test_result,omitempty"`
	TesterUserID           uint64 `json:"tester_user_id,omitempty"`
	ReleaseNote            string `json:"release_note,omitempty"`
	ClosedByUserID         uint64 `json:"closed_by_user_id,omitempty"`
	Remark                 string `json:"remark,omitempty"`
}

// UpsertStageSubmission persists stage submission and returns its id.
func (r *Repository) UpsertStageSubmission(
	ctx context.Context,
	requirementID uint64,
	stageCode string,
	operatorID uint64,
	sub StageSubmissionInput,
) (uint64, error) {
	sub.ReviewResult = strings.ToUpper(strings.TrimSpace(sub.ReviewResult))
	sub.TestResult = strings.ToUpper(strings.TrimSpace(sub.TestResult))
	now := time.Now().UTC()

	result, err := r.db.ExecContext(ctx, `
		INSERT INTO requirement_stage_submissions (
			requirement_id, stage_code,
			spec_body, acceptance_criteria, product_owner_user_id,
			review_result, review_comment, reviewer_user_id,
			dev_summary, implementation_notes, developer_user_id,
			test_summary, test_cases_covered, test_result, tester_user_id,
			release_note, closed_by_user_id,
			operator_user_id, submitted_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			spec_body = VALUES(spec_body),
			acceptance_criteria = VALUES(acceptance_criteria),
			product_owner_user_id = VALUES(product_owner_user_id),
			review_result = VALUES(review_result),
			review_comment = VALUES(review_comment),
			reviewer_user_id = VALUES(reviewer_user_id),
			dev_summary = VALUES(dev_summary),
			implementation_notes = VALUES(implementation_notes),
			developer_user_id = VALUES(developer_user_id),
			test_summary = VALUES(test_summary),
			test_cases_covered = VALUES(test_cases_covered),
			test_result = VALUES(test_result),
			tester_user_id = VALUES(tester_user_id),
			release_note = VALUES(release_note),
			closed_by_user_id = VALUES(closed_by_user_id),
			operator_user_id = VALUES(operator_user_id),
			submitted_at = VALUES(submitted_at),
			updated_at = CURRENT_TIMESTAMP(3)`,
		requirementID, stageCode,
		nullIfEmpty(sub.SpecBody), nullIfEmpty(sub.AcceptanceCriteria), nullUint64(sub.ProductOwnerUserID),
		nullIfEmpty(sub.ReviewResult), nullIfEmpty(sub.ReviewComment), nullUint64(sub.ReviewerUserID),
		nullIfEmpty(sub.DevSummary), nullIfEmpty(sub.ImplementationNotes), nullUint64(sub.DeveloperUserID),
		nullIfEmpty(sub.TestSummary), nullIfEmpty(sub.TestCasesCovered), nullIfEmpty(sub.TestResult), nullUint64(sub.TesterUserID),
		nullIfEmpty(sub.ReleaseNote), nullUint64(sub.ClosedByUserID),
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

// TransitionRuleRow is a DB-backed transition rule.
type TransitionRuleRow struct {
	FromStatus        string `json:"from_status"`
	ToStatus          string `json:"to_status"`
	RequiredStageCode string `json:"required_stage_code"`
	Description       string `json:"description"`
}

// ListRequirementTransitionRules returns rules from DB.
func (r *Repository) ListRequirementTransitionRules(ctx context.Context) ([]TransitionRuleRow, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT from_status, to_status, required_stage_code, description
		FROM status_transition_rules
		WHERE resource_type = 'REQUIREMENT'
		ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]TransitionRuleRow, 0)
	for rows.Next() {
		var item TransitionRuleRow
		if err := rows.Scan(&item.FromStatus, &item.ToStatus, &item.RequiredStageCode, &item.Description); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func toDomainSubmission(sub StageSubmissionInput) domain.StageSubmissionInput {
	return domain.StageSubmissionInput{
		SpecBody:               sub.SpecBody,
		AcceptanceCriteria:     sub.AcceptanceCriteria,
		ProductOwnerUserID:     sub.ProductOwnerUserID,
		ReviewResult:           sub.ReviewResult,
		ReviewComment:          sub.ReviewComment,
		ReviewerUserID:         sub.ReviewerUserID,
		DevSummary:             sub.DevSummary,
		DeveloperUserID:        sub.DeveloperUserID,
		BackendDeveloperUserID: sub.BackendDeveloperUserID,
		ImplementationNotes:    sub.ImplementationNotes,
		TestSummary:            sub.TestSummary,
		TestResult:             sub.TestResult,
		TesterUserID:           sub.TesterUserID,
		TestCasesCovered:       sub.TestCasesCovered,
		ReleaseNote:            sub.ReleaseNote,
		ClosedByUserID:         sub.ClosedByUserID,
		Remark:                 sub.Remark,
	}
}

func nullUint64(v uint64) any {
	if v == 0 {
		return nil
	}
	return v
}

const requirementSelectColumns = `
	id, project_id, requirement_code, title, description,
	priority, development_scope, current_status, status_version,
	product_owner_user_id, developer_user_id, backend_developer_user_id, tester_user_id,
	parent_requirement_id,
	EXISTS(
		SELECT 1 FROM requirement_stage_submissions development_frontend
		WHERE development_frontend.requirement_id = requirements.id
		  AND development_frontend.stage_code = 'DEVELOPMENT_FRONTEND'
	),
	EXISTS(
		SELECT 1 FROM requirement_stage_submissions development_backend
		WHERE development_backend.requirement_id = requirements.id
		  AND development_backend.stage_code = 'DEVELOPMENT_BACKEND'
	),
	DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%sZ')
`

func scanRequirement(row scanner) (Requirement, error) {
	var item Requirement
	var po, dev, backendDev, tester, parent sql.NullInt64
	err := row.Scan(
		&item.ID, &item.ProjectID, &item.RequirementCode, &item.Title, &item.Description,
		&item.Priority, &item.DevelopmentScope, &item.CurrentStatus, &item.StatusVersion,
		&po, &dev, &backendDev, &tester, &parent,
		&item.FrontendDevelopmentCompleted, &item.BackendDevelopmentCompleted,
		&item.UpdatedAt,
	)
	if err != nil {
		return Requirement{}, err
	}
	if po.Valid {
		v := uint64(po.Int64)
		item.ProductOwnerUserID = &v
	}
	if dev.Valid {
		v := uint64(dev.Int64)
		item.DeveloperUserID = &v
	}
	if backendDev.Valid {
		v := uint64(backendDev.Int64)
		item.BackendDeveloperUserID = &v
	}
	if tester.Valid {
		v := uint64(tester.Int64)
		item.TesterUserID = &v
	}
	if parent.Valid {
		v := uint64(parent.Int64)
		item.ParentRequirementID = &v
	}
	return item, nil
}
