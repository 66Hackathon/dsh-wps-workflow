package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/domain"
)

// Requirement is a requirement row.
type Requirement struct {
	ID                           uint64  `json:"id"`
	ProjectID                    uint64  `json:"project_id"`
	RequirementCode              string  `json:"requirement_code"`
	Title                        string  `json:"title"`
	Description                  string  `json:"description"`
	Priority                     string  `json:"priority"`
	DevelopmentScope             string  `json:"development_scope"`
	CurrentStatus                string  `json:"current_status"`
	StatusVersion                uint32  `json:"status_version"`
	ProductOwnerUserID           *uint64 `json:"product_owner_user_id,omitempty"`
	DeveloperUserID              *uint64 `json:"developer_user_id,omitempty"`
	BackendDeveloperUserID       *uint64 `json:"backend_developer_user_id,omitempty"`
	TesterUserID                 *uint64 `json:"tester_user_id,omitempty"`
	ParentRequirementID          *uint64 `json:"parent_requirement_id,omitempty"`
	FrontendDevelopmentCompleted bool    `json:"frontend_development_completed"`
	BackendDevelopmentCompleted  bool    `json:"backend_development_completed"`
	UpdatedAt                    string  `json:"updated_at,omitempty"`
}

// ListRequirements returns requirements for a project.
func (r *Repository) ListRequirements(ctx context.Context, projectID uint64) ([]Requirement, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT `+requirementSelectColumns+`
		FROM requirements
		WHERE project_id = ? AND archived_at IS NULL
		ORDER BY id DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]Requirement, 0)
	for rows.Next() {
		item, err := scanRequirement(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// GetRequirement returns a requirement by id.
func (r *Repository) GetRequirement(ctx context.Context, requirementID uint64) (Requirement, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT `+requirementSelectColumns+`
		FROM requirements
		WHERE id = ? AND archived_at IS NULL`, requirementID)
	item, err := scanRequirement(row)
	if err != nil {
		if err == sql.ErrNoRows {
			return Requirement{}, fmt.Errorf("requirement not found")
		}
		return Requirement{}, err
	}
	return item, nil
}

// CreateRequirementInput holds fields for creating a requirement.
type CreateRequirementInput struct {
	ProjectID          uint64
	RequirementCode    string
	Title              string
	Description        string
	Priority           string
	DevelopmentScope   string
	AcceptanceCriteria string
	ProductOwnerUserID uint64
	PlannedStartAt     *time.Time
	PlannedEndAt       *time.Time
	CreatedBy          uint64
}

// CreateRequirement inserts a new requirement and optional initial stage submission.
func (r *Repository) CreateRequirement(ctx context.Context, input CreateRequirementInput) (Requirement, error) {
	if strings.TrimSpace(input.Description) == "" {
		return Requirement{}, fmt.Errorf("description is required")
	}
	priority := input.Priority
	if priority == "" {
		priority = "MEDIUM"
	}
	scope := input.DevelopmentScope
	if scope == "" {
		scope = "FUNCTIONAL"
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return Requirement{}, err
	}
	defer func() { _ = tx.Rollback() }()

	var poUserID any
	if input.ProductOwnerUserID > 0 {
		poUserID = input.ProductOwnerUserID
	}

	result, err := tx.ExecContext(ctx, `
		INSERT INTO requirements (
			project_id, requirement_code, title, description, priority, development_scope,
			current_status, product_owner_user_id, planned_start_at, expected_at, created_by
		) VALUES (?, ?, ?, ?, ?, ?, 'PRODUCT_EDITING', ?, ?, ?, ?)`,
		input.ProjectID, input.RequirementCode, input.Title, input.Description,
		priority, scope, poUserID, input.PlannedStartAt, input.PlannedEndAt, input.CreatedBy)
	if err != nil {
		return Requirement{}, err
	}
	insertedID, err := result.LastInsertId()
	if err != nil {
		return Requirement{}, err
	}
	requirementID := uint64(insertedID)

	acceptance := strings.TrimSpace(input.AcceptanceCriteria)
	if acceptance != "" || input.ProductOwnerUserID > 0 {
		_, err = tx.ExecContext(ctx, `
			INSERT INTO requirement_stage_submissions (
				requirement_id, stage_code,
				spec_body, acceptance_criteria, product_owner_user_id,
				operator_user_id, submitted_at
			) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))
			ON DUPLICATE KEY UPDATE
				spec_body = VALUES(spec_body),
				acceptance_criteria = VALUES(acceptance_criteria),
				product_owner_user_id = VALUES(product_owner_user_id),
				operator_user_id = VALUES(operator_user_id),
				submitted_at = CURRENT_TIMESTAMP(3),
				updated_at = CURRENT_TIMESTAMP(3)`,
			requirementID, domain.StageProductEditing,
			nullIfEmpty(input.Description), nullIfEmpty(acceptance), nullUint64(input.ProductOwnerUserID),
			input.CreatedBy)
		if err != nil {
			return Requirement{}, err
		}
	}

	if err := tx.Commit(); err != nil {
		return Requirement{}, err
	}
	return r.GetRequirement(ctx, requirementID)
}

// TransitionRequirementStatus validates stage submission, persists it, and transitions status.
func (r *Repository) TransitionRequirementStatus(
	ctx context.Context,
	requirementID, operatorID uint64,
	toStatus string,
	submission StageSubmissionInput,
) (Requirement, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return Requirement{}, err
	}
	defer func() { _ = tx.Rollback() }()

	fromStatus, roleIDs, err := r.lockRequirementForTransition(ctx, tx, requirementID)
	if err != nil {
		return Requirement{}, err
	}

	rule := domain.FindTransitionRule(fromStatus, toStatus)
	if rule == nil {
		return Requirement{}, fmt.Errorf("invalid transition from %s to %s", fromStatus, toStatus)
	}

	if fromStatus == domain.StatusDevelopment && toStatus == domain.StatusDone {
		scope, err := r.getRequirementScopeTx(ctx, tx, requirementID)
		if err != nil {
			return Requirement{}, err
		}
		if scope != domain.ScopeBugFix {
			return Requirement{}, fmt.Errorf("only BUG_FIX requirements can transition from DEVELOPMENT to DONE")
		}
		frontendDone, backendDone, err := developmentCompletionStateTx(ctx, tx, requirementID)
		if err != nil {
			return Requirement{}, err
		}
		if (roleIDs.DeveloperUserID > 0 && !frontendDone) ||
			(roleIDs.BackendDeveloperUserID > 0 && !backendDone) {
			return Requirement{}, fmt.Errorf("all assigned developers must complete the bug fix before retest")
		}
	}

	domainSub := toDomainSubmission(submission)

	if err := domain.ValidateTransitionOperator(
		operatorID,
		roleIDs.ProductOwnerUserID,
		roleIDs.DeveloperUserID,
		roleIDs.BackendDeveloperUserID,
		roleIDs.TesterUserID,
		rule.RequiredStageCode,
		domainSub,
	); err != nil {
		return Requirement{}, fmt.Errorf("permission denied: %w", err)
	}

	if err := domain.ValidateStageSubmission(rule.RequiredStageCode, domainSub, toStatus); err != nil {
		return Requirement{}, fmt.Errorf("stage submission invalid: %w", err)
	}

	if rule.RequiredStageCode == domain.StageTesting && submission.TesterUserID > 0 {
		if err := domain.ValidateUniqueRequirementRoles(
			roleIDs.ProductOwnerUserID,
			roleIDs.DeveloperUserID,
			roleIDs.BackendDeveloperUserID,
			submission.TesterUserID,
		); err != nil {
			return Requirement{}, fmt.Errorf("stage submission invalid: %w", err)
		}
	}

	if fromStatus == domain.StatusDevelopment && toStatus == domain.StatusTesting {
		frontendDone, backendDone, err := developmentCompletionStateTx(ctx, tx, requirementID)
		if err != nil {
			return Requirement{}, err
		}
		if !frontendDone || !backendDone {
			return Requirement{}, fmt.Errorf("both frontend and backend developers must complete development before testing")
		}
	}

	submissionID, err := r.upsertStageSubmissionTx(ctx, tx, requirementID, rule.RequiredStageCode, operatorID, submission)
	if err != nil {
		return Requirement{}, err
	}

	remark := strings.TrimSpace(submission.Remark)
	if remark == "" {
		remark = rule.Description
	}

	if err := r.updateRequirementRolesTx(ctx, tx, requirementID, rule.RequiredStageCode, submission); err != nil {
		return Requirement{}, err
	}

	if toStatus == domain.StatusDevelopment {
		if _, err := tx.ExecContext(ctx, `
			DELETE FROM requirement_stage_submissions
			WHERE requirement_id = ? AND stage_code IN (?, ?)`,
			requirementID, domain.StageDevelopmentFrontend, domain.StageDevelopmentBackend); err != nil {
			return Requirement{}, err
		}
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE requirements SET current_status = ?, status_version = status_version + 1 WHERE id = ?`,
		toStatus, requirementID); err != nil {
		return Requirement{}, err
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO status_change_log (
			resource_type, resource_id, from_status, to_status, operator_user_id, remark, stage_submission_id
		) VALUES ('REQUIREMENT', ?, ?, ?, ?, ?, ?)`,
		requirementID, fromStatus, toStatus, operatorID, remark, submissionID); err != nil {
		return Requirement{}, err
	}

	if err := tx.Commit(); err != nil {
		return Requirement{}, err
	}
	return r.GetRequirement(ctx, requirementID)
}

type lockedRequirementRoles struct {
	ProductOwnerUserID     uint64
	DeveloperUserID        uint64
	BackendDeveloperUserID uint64
	TesterUserID           uint64
}

func (r *Repository) lockRequirementForTransition(ctx context.Context, tx *sql.Tx, requirementID uint64) (string, lockedRequirementRoles, error) {
	var fromStatus string
	var productOwner, developer, backendDeveloper, tester sql.NullInt64
	err := tx.QueryRowContext(ctx, `
		SELECT current_status, product_owner_user_id, developer_user_id, backend_developer_user_id, tester_user_id
		FROM requirements WHERE id = ? AND archived_at IS NULL FOR UPDATE`, requirementID).
		Scan(&fromStatus, &productOwner, &developer, &backendDeveloper, &tester)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", lockedRequirementRoles{}, fmt.Errorf("requirement not found")
		}
		return "", lockedRequirementRoles{}, err
	}
	roles := lockedRequirementRoles{}
	if productOwner.Valid {
		roles.ProductOwnerUserID = uint64(productOwner.Int64)
	}
	if developer.Valid {
		roles.DeveloperUserID = uint64(developer.Int64)
	}
	if backendDeveloper.Valid {
		roles.BackendDeveloperUserID = uint64(backendDeveloper.Int64)
	}
	if tester.Valid {
		roles.TesterUserID = uint64(tester.Int64)
	}
	return fromStatus, roles, nil
}

func (r *Repository) lockRequirementStatus(ctx context.Context, tx *sql.Tx, requirementID uint64) (string, error) {
	fromStatus, _, err := r.lockRequirementForTransition(ctx, tx, requirementID)
	return fromStatus, err
}

func (r *Repository) getRequirementScopeTx(ctx context.Context, tx *sql.Tx, requirementID uint64) (string, error) {
	var scope string
	err := tx.QueryRowContext(ctx, `
		SELECT development_scope FROM requirements WHERE id = ? AND archived_at IS NULL`, requirementID).Scan(&scope)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", fmt.Errorf("requirement not found")
		}
		return "", err
	}
	return scope, nil
}

func (r *Repository) upsertStageSubmissionTx(
	ctx context.Context,
	tx *sql.Tx,
	requirementID uint64,
	stageCode string,
	operatorID uint64,
	sub StageSubmissionInput,
) (uint64, error) {
	sub.ReviewResult = strings.ToUpper(strings.TrimSpace(sub.ReviewResult))
	sub.TestResult = strings.ToUpper(strings.TrimSpace(sub.TestResult))

	result, err := tx.ExecContext(ctx, `
		INSERT INTO requirement_stage_submissions (
			requirement_id, stage_code,
			spec_body, acceptance_criteria, product_owner_user_id,
			review_result, review_comment, reviewer_user_id,
			dev_summary, implementation_notes, developer_user_id,
			test_summary, test_cases_covered, test_result, tester_user_id,
			release_note, closed_by_user_id,
			operator_user_id, submitted_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))
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
			submitted_at = CURRENT_TIMESTAMP(3),
			updated_at = CURRENT_TIMESTAMP(3)`,
		requirementID, stageCode,
		nullIfEmpty(sub.SpecBody), nullIfEmpty(sub.AcceptanceCriteria), nullUint64(sub.ProductOwnerUserID),
		nullIfEmpty(sub.ReviewResult), nullIfEmpty(sub.ReviewComment), nullUint64(sub.ReviewerUserID),
		nullIfEmpty(sub.DevSummary), nullIfEmpty(sub.ImplementationNotes), nullUint64(sub.DeveloperUserID),
		nullIfEmpty(sub.TestSummary), nullIfEmpty(sub.TestCasesCovered), nullIfEmpty(sub.TestResult), nullUint64(sub.TesterUserID),
		nullIfEmpty(sub.ReleaseNote), nullUint64(sub.ClosedByUserID),
		operatorID,
	)
	if err != nil {
		return 0, err
	}
	insertedID, err := result.LastInsertId()
	if err != nil || insertedID == 0 {
		var id uint64
		err = tx.QueryRowContext(ctx, `
			SELECT id FROM requirement_stage_submissions
			WHERE requirement_id = ? AND stage_code = ?`, requirementID, stageCode).Scan(&id)
		if err != nil {
			return 0, err
		}
		return id, nil
	}
	return uint64(insertedID), nil
}

func (r *Repository) updateRequirementRolesTx(
	ctx context.Context,
	tx *sql.Tx,
	requirementID uint64,
	stageCode string,
	sub StageSubmissionInput,
) error {
	switch stageCode {
	case domain.StageProductEditing:
		if sub.ProductOwnerUserID == 0 {
			return nil
		}
		_, err := tx.ExecContext(ctx, `
			UPDATE requirements SET product_owner_user_id = ? WHERE id = ?`,
			sub.ProductOwnerUserID, requirementID)
		return err
	case domain.StageProductReview:
		if sub.DeveloperUserID == 0 {
			return nil
		}
		_, err := tx.ExecContext(ctx, `
			UPDATE requirements
			SET developer_user_id = ?, backend_developer_user_id = ?, tester_user_id = ?
			WHERE id = ?`,
			sub.DeveloperUserID, nullUint64(sub.BackendDeveloperUserID), nullUint64(sub.TesterUserID), requirementID)
		return err
	case domain.StageDevelopment:
		// Development completion must not change the assignees established
		// during product review.
		return nil
	case domain.StageTesting:
		if sub.TesterUserID == 0 {
			return nil
		}
		_, err := tx.ExecContext(ctx, `
			UPDATE requirements SET tester_user_id = ? WHERE id = ?`,
			sub.TesterUserID, requirementID)
		return err
	default:
		return nil
	}
}
