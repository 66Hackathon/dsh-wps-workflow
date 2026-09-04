package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/domain"
)

// Requirement is a work-item row (type = REQUIREMENT or BUG).
type Requirement struct {
	ID                     uint64  `json:"id"`
	ProjectID              uint64  `json:"project_id"`
	RequirementCode        string  `json:"requirement_code"`
	ItemType               string  `json:"item_type"`
	Title                  string  `json:"title"`
	Description            string  `json:"description"`
	Priority               string  `json:"priority"`
	CurrentStatus          string  `json:"current_status"`
	StatusVersion          uint32  `json:"status_version"`
	DevDirections          string  `json:"dev_directions"`
	DeveloperUserID        *uint64 `json:"developer_user_id,omitempty"`
	BackendDeveloperUserID *uint64 `json:"backend_developer_user_id,omitempty"`
	TesterUserID           *uint64 `json:"tester_user_id,omitempty"`
	FrontendDevCompleted   bool    `json:"frontend_development_completed"`
	BackendDevCompleted    bool    `json:"backend_development_completed"`
	ParentItemID           *uint64 `json:"parent_item_id,omitempty"`
	TriggeredAtStage       *string `json:"triggered_at_stage,omitempty"`
	// CreatedBy is the product owner (creator of the work item)
	CreatedBy uint64 `json:"created_by"`
	UpdatedAt string `json:"updated_at,omitempty"`
}

const requirementSelectColumns = `
	id, project_id, requirement_code, item_type, title, description,
	priority, current_status, status_version,
	IFNULL(dev_directions, 'FRONTEND'),
	developer_user_id, backend_developer_user_id, tester_user_id,
	frontend_dev_completed, backend_dev_completed,
	parent_item_id, triggered_at_stage,
	created_by,
	DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%sZ')
`

func scanRequirement(row scanner) (Requirement, error) {
	var item Requirement
	var frontendDev, backendDev sql.NullInt64
	var tester, parent sql.NullInt64
	var triggeredAtStage sql.NullString
	var feDone, beDone int
	err := row.Scan(
		&item.ID, &item.ProjectID, &item.RequirementCode, &item.ItemType,
		&item.Title, &item.Description,
		&item.Priority, &item.CurrentStatus, &item.StatusVersion,
		&item.DevDirections,
		&frontendDev, &backendDev, &tester,
		&feDone, &beDone,
		&parent, &triggeredAtStage,
		&item.CreatedBy,
		&item.UpdatedAt,
	)
	if err != nil {
		return Requirement{}, err
	}
	if frontendDev.Valid {
		v := uint64(frontendDev.Int64)
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
	item.FrontendDevCompleted = feDone == 1
	item.BackendDevCompleted = beDone == 1
	if parent.Valid {
		v := uint64(parent.Int64)
		item.ParentItemID = &v
	}
	if triggeredAtStage.Valid {
		item.TriggeredAtStage = &triggeredAtStage.String
	}
	return item, nil
}

// ListRequirements returns REQUIREMENT and BUG work-items for a project,
// including closed ones so finished items remain visible in the board.
func (r *Repository) ListRequirements(ctx context.Context, projectID uint64) ([]Requirement, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT `+requirementSelectColumns+`
		FROM requirements
		WHERE project_id = ? AND item_type IN ('REQUIREMENT', 'BUG')
		ORDER BY
			CASE WHEN closed_at IS NULL THEN 0 ELSE 1 END,
			id DESC`, projectID)
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

// GetRequirement returns a work-item by id (requirement or bug), including closed ones.
func (r *Repository) GetRequirement(ctx context.Context, requirementID uint64) (Requirement, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT `+requirementSelectColumns+`
		FROM requirements
		WHERE id = ?`, requirementID)
	item, err := scanRequirement(row)
	if err != nil {
		if err == sql.ErrNoRows {
			return Requirement{}, fmt.Errorf("requirement not found")
		}
		return Requirement{}, err
	}
	return item, nil
}

// UpdateRequirementContentInput holds editable requirement content fields.
type UpdateRequirementContentInput struct {
	Title       string
	Description string
	Priority    string
}

// UpdateRequirementContent updates title/description/priority.
// Only the product owner (created_by) may update; closed items are rejected.
func (r *Repository) UpdateRequirementContent(
	ctx context.Context,
	requirementID uint64,
	operatorUserID uint64,
	input UpdateRequirementContentInput,
) (Requirement, error) {
	item, err := r.GetRequirement(ctx, requirementID)
	if err != nil {
		return Requirement{}, err
	}
	if item.CreatedBy != operatorUserID {
		return Requirement{}, fmt.Errorf("permission denied: only the product owner can update requirement content")
	}
	if item.CurrentStatus == "CLOSED" {
		return Requirement{}, fmt.Errorf("closed requirement cannot be updated")
	}

	title := strings.TrimSpace(input.Title)
	description := strings.TrimSpace(input.Description)
	priority := strings.TrimSpace(input.Priority)
	if title == "" {
		return Requirement{}, fmt.Errorf("title is required")
	}
	if description == "" {
		return Requirement{}, fmt.Errorf("description is required")
	}
	if priority == "" {
		priority = item.Priority
	}
	switch priority {
	case "LOW", "MEDIUM", "HIGH", "URGENT":
	default:
		return Requirement{}, fmt.Errorf("invalid priority")
	}

	_, err = r.db.ExecContext(ctx, `
		UPDATE requirements
		SET title = ?, description = ?, priority = ?, updated_at = CURRENT_TIMESTAMP(3)
		WHERE id = ?`, title, description, priority, requirementID)
	if err != nil {
		return Requirement{}, err
	}
	return r.GetRequirement(ctx, requirementID)
}

// ListBugsByRequirement returns Bug sub-items associated with a parent requirement.
func (r *Repository) ListBugsByRequirement(ctx context.Context, parentItemID uint64) ([]Requirement, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT `+requirementSelectColumns+`
		FROM requirements
		WHERE parent_item_id = ? AND item_type = 'BUG'
		ORDER BY id ASC`, parentItemID)
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

// CountOpenBugsByRequirement returns how many Bug sub-items are not CLOSED.
func (r *Repository) CountOpenBugsByRequirement(ctx context.Context, parentItemID uint64) (int, error) {
	var count int
	err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM requirements
		WHERE parent_item_id = ? AND item_type = 'BUG' AND current_status != 'CLOSED'`, parentItemID).Scan(&count)
	return count, err
}

// CreateRequirementInput holds fields for creating a requirement.
type CreateRequirementInput struct {
	ProjectID       uint64
	RequirementCode string
	Title           string
	Description     string
	Priority        string
	DevDirections   string
	// Optional: pre-assign developers / tester at creation time
	DeveloperUserID        uint64
	BackendDeveloperUserID uint64
	TesterUserID           uint64
	PlannedStartAt         *time.Time
	PlannedEndAt           *time.Time
	CreatedBy              uint64
}

// CreateRequirement inserts a new REQUIREMENT work-item.
func (r *Repository) CreateRequirement(ctx context.Context, input CreateRequirementInput) (Requirement, error) {
	if strings.TrimSpace(input.Description) == "" {
		return Requirement{}, fmt.Errorf("description is required")
	}
	priority := input.Priority
	if priority == "" {
		priority = "MEDIUM"
	}
	if strings.TrimSpace(input.DevDirections) == "" {
		input.DevDirections = domain.DevDirectionFrontend
	}
	directions, err := domain.NormalizeSingleRequirementDirection(input.DevDirections)
	if err != nil {
		return Requirement{}, err
	}
	frontendID := input.DeveloperUserID
	backendID := input.BackendDeveloperUserID
	if !domain.RequirementNeedsFrontend(directions) {
		frontendID = 0
	}
	if !domain.RequirementNeedsBackend(directions) {
		backendID = 0
	}

	result, err := r.db.ExecContext(ctx, `
		INSERT INTO requirements (
			project_id, requirement_code, item_type, title, description, priority,
			current_status, dev_directions,
			developer_user_id, backend_developer_user_id, tester_user_id,
			planned_start_at, expected_at, created_by
		) VALUES (?, ?, 'REQUIREMENT', ?, ?, ?, 'CREATED', ?, ?, ?, ?, ?, ?, ?)`,
		input.ProjectID, input.RequirementCode,
		input.Title, input.Description, priority,
		directions,
		nullUint64(frontendID), nullUint64(backendID), nullUint64(input.TesterUserID),
		input.PlannedStartAt, input.PlannedEndAt, input.CreatedBy)
	if err != nil {
		return Requirement{}, err
	}
	insertedID, err := result.LastInsertId()
	if err != nil {
		return Requirement{}, err
	}
	return r.GetRequirement(ctx, uint64(insertedID))
}

// CreateBugItemInput holds fields for creating a Bug sub-item.
type CreateBugItemInput struct {
	ProjectID              uint64
	RequirementCode        string
	Title                  string
	Description            string
	Priority               string
	ParentItemID           uint64 // required — main requirement id
	TriggeredAtStage       string // TESTING or REGRESSION
	DeveloperUserID        uint64 // inherited from parent (frontend)
	BackendDeveloperUserID uint64 // inherited from parent (backend)
	TesterUserID           uint64 // inherited from parent
	CreatedBy              uint64
}

// CreateBugItem inserts a BUG sub-item directly into DEVELOPMENT status.
// Parent requirement status is unchanged (submit-bug does not roll back the main item).
func (r *Repository) CreateBugItem(ctx context.Context, input CreateBugItemInput) (Requirement, error) {
	if strings.TrimSpace(input.Title) == "" {
		return Requirement{}, fmt.Errorf("title is required")
	}
	priority := input.Priority
	if priority == "" {
		priority = "MEDIUM"
	}

	directions := domain.DevDirectionFrontend
	if input.DeveloperUserID > 0 && input.BackendDeveloperUserID > 0 {
		directions = domain.DevDirectionFrontend + "," + domain.DevDirectionBackend
	} else if input.BackendDeveloperUserID > 0 && input.DeveloperUserID == 0 {
		directions = domain.DevDirectionBackend
	}

	result, err := r.db.ExecContext(ctx, `
		INSERT INTO requirements (
			project_id, requirement_code, item_type, title, description, priority,
			current_status, dev_directions,
			developer_user_id, backend_developer_user_id, tester_user_id,
			parent_item_id, triggered_at_stage, created_by
		) VALUES (?, ?, 'BUG', ?, ?, ?, 'DEVELOPMENT', ?, ?, ?, ?, ?, ?, ?)`,
		input.ProjectID, input.RequirementCode,
		input.Title, input.Description, priority,
		directions,
		nullUint64(input.DeveloperUserID), nullUint64(input.BackendDeveloperUserID), nullUint64(input.TesterUserID),
		input.ParentItemID, nullIfEmpty(input.TriggeredAtStage), input.CreatedBy)
	if err != nil {
		return Requirement{}, err
	}
	insertedID, err := result.LastInsertId()
	if err != nil {
		return Requirement{}, err
	}
	return r.GetRequirement(ctx, uint64(insertedID))
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

	// Fetch item type for rule lookup
	var itemType string
	if err := tx.QueryRowContext(ctx, `SELECT item_type FROM requirements WHERE id = ?`, requirementID).
		Scan(&itemType); err != nil {
		return Requirement{}, err
	}

	rule := domain.FindTransitionRule(itemType, fromStatus, toStatus)
	if rule == nil {
		return Requirement{}, fmt.Errorf("invalid transition from %s to %s", fromStatus, toStatus)
	}

	domainSub := toDomainSubmission(submission)

	// Role check
	if err := domain.ValidateTransitionOperator(
		operatorID,
		roleIDs.CreatedBy,
		roleIDs.DeveloperUserID,
		roleIDs.BackendDeveloperUserID,
		roleIDs.TesterUserID,
		rule.RequiredStageCode,
	); err != nil {
		return Requirement{}, fmt.Errorf("permission denied: %w", err)
	}

	// Field validation
	if err := domain.ValidateStageSubmission(rule.RequiredStageCode, domainSub, toStatus); err != nil {
		return Requirement{}, fmt.Errorf("stage submission invalid: %w", err)
	}

	// For REQUIREMENT: must have no open bug sub-items when testing passes or acceptance passes
	if itemType == domain.ItemTypeRequirement && domain.StagesRequiringBugCheck[rule.RequiredStageCode] {
		if toStatus == domain.StatusProductAcceptance || toStatus == domain.StatusRegression {
			openCount, err := r.countOpenBugsTx(ctx, tx, requirementID)
			if err != nil {
				return Requirement{}, err
			}
			if err := domain.CheckAllBugsClosed(openCount); err != nil {
				return Requirement{}, err
			}
		}
	}

	submissionID, err := r.upsertStageSubmissionTx(ctx, tx, requirementID, rule.RequiredStageCode, operatorID, submission)
	if err != nil {
		return Requirement{}, err
	}

	// Update developer / tester assignment if provided in submission
	if err := r.updateRequirementRolesTx(ctx, tx, requirementID, rule.RequiredStageCode, submission); err != nil {
		return Requirement{}, err
	}

	remark := strings.TrimSpace(submission.Remark)
	if remark == "" {
		remark = rule.Description
	}

	// Close work-item when status reaches CLOSED
	var closedAtExpr string
	if toStatus == domain.StatusClosed {
		closedAtExpr = ", closed_at = CURRENT_TIMESTAMP(3)"
	}

	// 测试/验收失败退回研发时，重置研发完成标记，便于再次开发后进入测试
	resetDevFlags := ""
	if toStatus == domain.StatusDevelopment &&
		(fromStatus == domain.StatusTesting || fromStatus == domain.StatusProductAcceptance) {
		resetDevFlags = ", frontend_dev_completed = 0, backend_dev_completed = 0"
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE requirements SET current_status = ?, status_version = status_version + 1`+closedAtExpr+resetDevFlags+`
		WHERE id = ?`, toStatus, requirementID); err != nil {
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

// UpdateRegressionResult allows changing a FAIL regression result to PASS after the fact.
func (r *Repository) UpdateRegressionResult(ctx context.Context, requirementID, operatorID uint64, summary string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE requirement_stage_submissions
		SET regression_result = 'PASS', regression_summary = ?, operator_user_id = ?, updated_at = CURRENT_TIMESTAMP(3)
		WHERE requirement_id = ? AND stage_code = 'REGRESSION'`,
		summary, operatorID, requirementID)
	return err
}

// ── internal helpers ─────────────────────────────────────────────────────────

type lockedRequirementRoles struct {
	CreatedBy              uint64
	DeveloperUserID        uint64
	BackendDeveloperUserID uint64
	TesterUserID           uint64
	DevDirections          string
	FrontendDevCompleted   bool
	BackendDevCompleted    bool
}

func (r *Repository) lockRequirementForTransition(ctx context.Context, tx *sql.Tx, requirementID uint64) (string, lockedRequirementRoles, error) {
	var fromStatus string
	var developer, backendDev, tester sql.NullInt64
	var createdBy uint64
	var directions string
	var feDone, beDone int
	err := tx.QueryRowContext(ctx, `
		SELECT current_status,
			developer_user_id, backend_developer_user_id, tester_user_id, created_by,
			IFNULL(dev_directions, 'FRONTEND'),
			frontend_dev_completed, backend_dev_completed
		FROM requirements WHERE id = ? AND closed_at IS NULL FOR UPDATE`, requirementID).
		Scan(&fromStatus, &developer, &backendDev, &tester, &createdBy, &directions, &feDone, &beDone)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", lockedRequirementRoles{}, fmt.Errorf("requirement not found")
		}
		return "", lockedRequirementRoles{}, err
	}
	roles := lockedRequirementRoles{
		CreatedBy:            createdBy,
		DevDirections:        directions,
		FrontendDevCompleted: feDone == 1,
		BackendDevCompleted:  beDone == 1,
	}
	if developer.Valid {
		roles.DeveloperUserID = uint64(developer.Int64)
	}
	if backendDev.Valid {
		roles.BackendDeveloperUserID = uint64(backendDev.Int64)
	}
	if tester.Valid {
		roles.TesterUserID = uint64(tester.Int64)
	}
	return fromStatus, roles, nil
}

func (r *Repository) countOpenBugsTx(ctx context.Context, tx *sql.Tx, parentItemID uint64) (int, error) {
	var count int
	err := tx.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM requirements
		WHERE parent_item_id = ? AND item_type = 'BUG' AND current_status != 'CLOSED'`, parentItemID).Scan(&count)
	return count, err
}

func (r *Repository) upsertStageSubmissionTx(
	ctx context.Context,
	tx *sql.Tx,
	requirementID uint64,
	stageCode string,
	operatorID uint64,
	sub StageSubmissionInput,
) (uint64, error) {
	sub.TestResult = strings.ToUpper(strings.TrimSpace(sub.TestResult))
	sub.AcceptResult = strings.ToUpper(strings.TrimSpace(sub.AcceptResult))
	sub.RegressionResult = strings.ToUpper(strings.TrimSpace(sub.RegressionResult))

	result, err := tx.ExecContext(ctx, `
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
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))
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
			submitted_at           = CURRENT_TIMESTAMP(3),
			updated_at             = CURRENT_TIMESTAMP(3)`,
		requirementID, stageCode,
		nullIfEmpty(sub.SpecBody), nullIfEmpty(sub.AcceptanceCriteria),
		nullIfEmpty(sub.DevDesignDoc),
		nullIfEmpty(sub.DevSummary), nullIfEmpty(sub.ImplementationNotes), nullUint64(sub.DeveloperUserID),
		nullIfEmpty(sub.ReturnReason),
		nullIfEmpty(sub.TestResult), nullIfEmpty(sub.TestSummary), nullIfEmpty(sub.TestCasesCovered), nullUint64(sub.TesterUserID),
		nullIfEmpty(sub.AcceptanceNote),
		nullIfEmpty(sub.RegressionResult), nullIfEmpty(sub.RegressionSummary),
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
	case domain.StageProductDesign:
		// 产品方案阶段：可更新研发/测试人员预设
		if sub.DeveloperUserID > 0 || sub.BackendDeveloperUserID > 0 || sub.TesterUserID > 0 {
			_, err := tx.ExecContext(ctx, `
				UPDATE requirements SET
					developer_user_id = COALESCE(NULLIF(?, 0), developer_user_id),
					backend_developer_user_id = COALESCE(NULLIF(?, 0), backend_developer_user_id),
					tester_user_id    = COALESCE(NULLIF(?, 0), tester_user_id)
				WHERE id = ?`,
				sub.DeveloperUserID, sub.BackendDeveloperUserID, sub.TesterUserID, requirementID)
			return err
		}
	case domain.StageDevDesign, domain.StageDevelopment:
		// 研发方案/开发阶段：不修改角色
		return nil
	case domain.StageTesting:
		if sub.TesterUserID > 0 {
			_, err := tx.ExecContext(ctx, `UPDATE requirements SET tester_user_id = ? WHERE id = ?`,
				sub.TesterUserID, requirementID)
			return err
		}
	}
	return nil
}

// CompleteDevelopmentResult is returned after a track completes development.
type CompleteDevelopmentResult struct {
	Requirement       Requirement `json:"requirement"`
	FrontendCompleted bool        `json:"frontend_completed"`
	BackendCompleted  bool        `json:"backend_completed"`
	Transitioned      bool        `json:"transitioned"`
}

// CompleteDevelopment marks the operator's development track complete.
// When all required directions are done, transitions DEVELOPMENT → TESTING.
func (r *Repository) CompleteDevelopment(
	ctx context.Context,
	requirementID, operatorID uint64,
	devSummary, implementationNotes string,
) (CompleteDevelopmentResult, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return CompleteDevelopmentResult{}, err
	}
	defer func() { _ = tx.Rollback() }()

	fromStatus, roles, err := r.lockRequirementForTransition(ctx, tx, requirementID)
	if err != nil {
		return CompleteDevelopmentResult{}, err
	}
	if fromStatus != domain.StatusDevelopment {
		return CompleteDevelopmentResult{}, fmt.Errorf("requirement is not in DEVELOPMENT status")
	}

	needsFE := domain.RequirementNeedsFrontend(roles.DevDirections)
	needsBE := domain.RequirementNeedsBackend(roles.DevDirections)
	feDone := roles.FrontendDevCompleted
	beDone := roles.BackendDevCompleted

	switch {
	case needsFE && operatorID == roles.DeveloperUserID:
		feDone = true
	case needsBE && operatorID == roles.BackendDeveloperUserID:
		beDone = true
	default:
		return CompleteDevelopmentResult{}, fmt.Errorf("only the assigned track developer can complete development")
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE requirements
		SET frontend_dev_completed = ?, backend_dev_completed = ?
		WHERE id = ?`,
		boolToTiny(feDone), boolToTiny(beDone), requirementID); err != nil {
		return CompleteDevelopmentResult{}, err
	}

	allDone := (!needsFE || feDone) && (!needsBE || beDone)
	transitioned := false
	if allDone {
		summary := strings.TrimSpace(devSummary)
		if summary == "" {
			summary = "所选研发方向均已完成"
		}
		notes := strings.TrimSpace(implementationNotes)
		if notes == "" {
			notes = "前后端（按方向）研发已提交完成，进入测试阶段。"
		}
		submission := StageSubmissionInput{
			DevSummary:          summary,
			ImplementationNotes: notes,
			DeveloperUserID:     roles.DeveloperUserID,
			Remark:              "研发完成，进入测试阶段。",
		}
		if _, err := r.upsertStageSubmissionTx(ctx, tx, requirementID, domain.StageDevelopment, operatorID, submission); err != nil {
			return CompleteDevelopmentResult{}, err
		}
		if _, err := tx.ExecContext(ctx, `
			UPDATE requirements
			SET current_status = ?, status_version = status_version + 1
			WHERE id = ?`, domain.StatusTesting, requirementID); err != nil {
			return CompleteDevelopmentResult{}, err
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO status_change_log (
				resource_type, resource_id, from_status, to_status, operator_user_id, remark
			) VALUES ('REQUIREMENT', ?, ?, ?, ?, ?)`,
			requirementID, fromStatus, domain.StatusTesting, operatorID, submission.Remark); err != nil {
			return CompleteDevelopmentResult{}, err
		}
		transitioned = true
	}

	if err := tx.Commit(); err != nil {
		return CompleteDevelopmentResult{}, err
	}
	item, err := r.GetRequirement(ctx, requirementID)
	if err != nil {
		return CompleteDevelopmentResult{}, err
	}
	return CompleteDevelopmentResult{
		Requirement:       item,
		FrontendCompleted: item.FrontendDevCompleted,
		BackendCompleted:  item.BackendDevCompleted,
		Transitioned:      transitioned,
	}, nil
}

func boolToTiny(v bool) int {
	if v {
		return 1
	}
	return 0
}
