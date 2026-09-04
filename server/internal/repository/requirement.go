package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/domain"
)

// Requirement is a work-item row (requirement_type = REQUIREMENT or BUG).
type Requirement struct {
	ID                  uint64  `json:"id"`
	ProjectID           uint64  `json:"project_id"`
	RequirementType     string  `json:"requirement_type"`
	ParentRequirementID *uint64 `json:"parent_requirement_id,omitempty"`
	SourceStageCode     *string `json:"source_stage_code,omitempty"`
	Title               string  `json:"title"`
	Description         string  `json:"description"`
	Priority            string  `json:"priority"`
	DevelopmentType     *string `json:"development_type,omitempty"`
	CurrentStatus       string  `json:"current_status"`
	DeveloperUserID     *uint64 `json:"developer_user_id,omitempty"`
	TesterUserID        *uint64 `json:"tester_user_id,omitempty"`
	// CreatedBy is the product owner (creator of the work item).
	CreatedBy        uint64  `json:"created_by"`
	RegressionResult *string `json:"regression_result,omitempty"`
	StatusVersion    uint32  `json:"status_version"`
	CreatedAt        string  `json:"created_at,omitempty"`
	UpdatedAt        string  `json:"updated_at,omitempty"`
	CompletedAt      *string `json:"completed_at,omitempty"`

	// Legacy aliases kept so existing clients keep working.
	RequirementCode  string  `json:"requirement_code"`
	ItemType         string  `json:"item_type"`
	DevDirections    string  `json:"dev_directions,omitempty"`
	ParentItemID     *uint64 `json:"parent_item_id,omitempty"`
	TriggeredAtStage *string `json:"triggered_at_stage,omitempty"`
}

// applyRequirementCompatFields fills the legacy alias JSON fields.
func (item *Requirement) applyRequirementCompatFields() {
	item.ItemType = item.RequirementType
	prefix := "REQ"
	if item.RequirementType == domain.ItemTypeBug {
		prefix = "BUG"
	}
	item.RequirementCode = fmt.Sprintf("%s-%06d", prefix, item.ID)
	if item.DevelopmentType != nil {
		item.DevDirections = *item.DevelopmentType
	}
	item.ParentItemID = item.ParentRequirementID
	item.TriggeredAtStage = item.SourceStageCode
}

const requirementSelectColumns = `
	id, project_id, requirement_type, parent_requirement_id, source_stage_code,
	title, IFNULL(description, ''), priority, development_type,
	current_status, developer_user_id, tester_user_id, created_by,
	regression_result, status_version,
	DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ'),
	DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%sZ'),
	DATE_FORMAT(completed_at, '%Y-%m-%dT%H:%i:%sZ')
`

func scanRequirement(row scanner) (Requirement, error) {
	var item Requirement
	var parent, developer, tester sql.NullInt64
	var sourceStage, developmentType, regressionResult, completedAt sql.NullString
	err := row.Scan(
		&item.ID, &item.ProjectID, &item.RequirementType, &parent, &sourceStage,
		&item.Title, &item.Description, &item.Priority, &developmentType,
		&item.CurrentStatus, &developer, &tester, &item.CreatedBy,
		&regressionResult, &item.StatusVersion,
		&item.CreatedAt, &item.UpdatedAt, &completedAt,
	)
	if err != nil {
		return Requirement{}, err
	}
	assignNullUint64(&item.ParentRequirementID, parent)
	assignNullUint64(&item.DeveloperUserID, developer)
	assignNullUint64(&item.TesterUserID, tester)
	assignNullString(&item.SourceStageCode, sourceStage)
	assignNullString(&item.DevelopmentType, developmentType)
	assignNullString(&item.RegressionResult, regressionResult)
	assignNullString(&item.CompletedAt, completedAt)
	item.applyRequirementCompatFields()
	return item, nil
}

// ListRequirements returns REQUIREMENT and BUG work-items for a project,
// including completed ones so finished items remain visible in the board.
func (r *Repository) ListRequirements(ctx context.Context, projectID uint64) ([]Requirement, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT `+requirementSelectColumns+`
		FROM requirements
		WHERE project_id = ?
		ORDER BY
			CASE WHEN current_status = 'COMPLETED' THEN 1 ELSE 0 END,
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

// GetRequirement returns a work-item by id (requirement or bug).
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
// Only the product owner (created_by) may update; completed items are rejected.
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
	if domain.IsTerminalStatus(item.CurrentStatus) {
		return Requirement{}, fmt.Errorf("completed requirement cannot be updated")
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
	if err := validatePriority(priority); err != nil {
		return Requirement{}, err
	}

	_, err = r.db.ExecContext(ctx, `
		UPDATE requirements
		SET title = ?, description = ?, priority = ?
		WHERE id = ?`, title, description, priority, requirementID)
	if err != nil {
		return Requirement{}, err
	}
	return r.GetRequirement(ctx, requirementID)
}

// ListBugsByRequirement returns Bug sub-items associated with a parent requirement.
func (r *Repository) ListBugsByRequirement(ctx context.Context, parentRequirementID uint64) ([]Requirement, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT `+requirementSelectColumns+`
		FROM requirements
		WHERE parent_requirement_id = ? AND requirement_type = 'BUG'
		ORDER BY id ASC`, parentRequirementID)
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

// CountOpenBugsByRequirement returns how many Bug sub-items are not COMPLETED.
func (r *Repository) CountOpenBugsByRequirement(ctx context.Context, parentRequirementID uint64) (int, error) {
	var count int
	err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM requirements
		WHERE parent_requirement_id = ? AND requirement_type = 'BUG' AND current_status <> 'COMPLETED'`,
		parentRequirementID).Scan(&count)
	return count, err
}

// CreateRequirementInput holds fields for creating a requirement.
type CreateRequirementInput struct {
	ProjectID   uint64
	Title       string
	Description string
	Priority    string
	// DevelopmentType is optional at creation time; it must be set before
	// the requirement enters DEVELOPMENT.
	DevelopmentType string
	DeveloperUserID uint64
	TesterUserID    uint64
	CreatedBy       uint64
}

// CreateRequirement inserts a new REQUIREMENT work-item at PRODUCT_DESIGN.
func (r *Repository) CreateRequirement(ctx context.Context, input CreateRequirementInput) (Requirement, error) {
	if strings.TrimSpace(input.Title) == "" {
		return Requirement{}, fmt.Errorf("title is required")
	}
	if strings.TrimSpace(input.Description) == "" {
		return Requirement{}, fmt.Errorf("description is required")
	}
	priority := defaultPriority(input.Priority)
	if err := validatePriority(priority); err != nil {
		return Requirement{}, err
	}
	developmentType, err := domain.NormalizeDevelopmentType(input.DevelopmentType)
	if err != nil {
		return Requirement{}, err
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return Requirement{}, err
	}
	defer func() { _ = tx.Rollback() }()

	result, err := tx.ExecContext(ctx, `
		INSERT INTO requirements (
			project_id, requirement_type, title, description, priority,
			development_type, current_status,
			developer_user_id, tester_user_id, created_by
		) VALUES (?, 'REQUIREMENT', ?, ?, ?, ?, ?, ?, ?, ?)`,
		input.ProjectID,
		strings.TrimSpace(input.Title), strings.TrimSpace(input.Description), priority,
		nullIfEmpty(developmentType), domain.InitialRequirementStatus,
		nullUint64(input.DeveloperUserID), nullUint64(input.TesterUserID), input.CreatedBy)
	if err != nil {
		return Requirement{}, err
	}
	insertedID, err := result.LastInsertId()
	if err != nil {
		return Requirement{}, err
	}
	if err := insertStatusChangeLog(ctx, tx, statusChangeLogEntry{
		RequirementID:  uint64(insertedID),
		ToStatus:       domain.InitialRequirementStatus,
		OperatorUserID: input.CreatedBy,
		Remark:         "创建需求，进入产品方案设计阶段。",
	}); err != nil {
		return Requirement{}, err
	}
	if err := tx.Commit(); err != nil {
		return Requirement{}, err
	}
	return r.GetRequirement(ctx, uint64(insertedID))
}

// CreateBugItemInput holds fields for creating a Bug sub-item.
type CreateBugItemInput struct {
	ProjectID   uint64
	Title       string
	Description string
	Priority    string
	// ParentRequirementID is required — the requirement the bug was found in.
	ParentRequirementID uint64
	// SourceStageCode is the stage the bug was raised from
	// (TESTING / PRODUCT_ACCEPTANCE / REGRESSION).
	SourceStageCode string
	DevelopmentType string // inherited from parent
	DeveloperUserID uint64 // inherited from parent
	TesterUserID    uint64 // inherited from parent
	CreatedBy       uint64
}

// CreateBugItem inserts a BUG sub-item directly into DEVELOPMENT status.
// Parent requirement status is unchanged (submit-bug does not roll back the main item).
func (r *Repository) CreateBugItem(ctx context.Context, input CreateBugItemInput) (Requirement, error) {
	if strings.TrimSpace(input.Title) == "" {
		return Requirement{}, fmt.Errorf("title is required")
	}
	if input.ParentRequirementID == 0 {
		return Requirement{}, fmt.Errorf("parent_requirement_id is required for a bug")
	}
	if err := domain.ValidateBugSourceStage(input.SourceStageCode); err != nil {
		return Requirement{}, err
	}
	priority := defaultPriority(input.Priority)
	if err := validatePriority(priority); err != nil {
		return Requirement{}, err
	}
	developmentType, err := domain.NormalizeDevelopmentType(input.DevelopmentType)
	if err != nil {
		return Requirement{}, err
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return Requirement{}, err
	}
	defer func() { _ = tx.Rollback() }()

	result, err := tx.ExecContext(ctx, `
		INSERT INTO requirements (
			project_id, requirement_type, parent_requirement_id, source_stage_code,
			title, description, priority,
			development_type, current_status,
			developer_user_id, tester_user_id, created_by
		) VALUES (?, 'BUG', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		input.ProjectID, input.ParentRequirementID,
		strings.ToUpper(strings.TrimSpace(input.SourceStageCode)),
		strings.TrimSpace(input.Title), nullIfEmptyString(input.Description), priority,
		nullIfEmpty(developmentType), domain.InitialBugStatus,
		nullUint64(input.DeveloperUserID), nullUint64(input.TesterUserID), input.CreatedBy)
	if err != nil {
		return Requirement{}, err
	}
	insertedID, err := result.LastInsertId()
	if err != nil {
		return Requirement{}, err
	}
	if err := insertStatusChangeLog(ctx, tx, statusChangeLogEntry{
		RequirementID:  uint64(insertedID),
		ToStatus:       domain.InitialBugStatus,
		OperatorUserID: input.CreatedBy,
		Remark:         "测试提交 Bug，进入研发修复阶段。",
	}); err != nil {
		return Requirement{}, err
	}
	if err := tx.Commit(); err != nil {
		return Requirement{}, err
	}
	return r.GetRequirement(ctx, uint64(insertedID))
}

// TransitionRequirementStatus validates the stage submission, persists it and
// moves the work-item to the next status in one transaction.
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

	locked, err := r.lockRequirementForTransition(ctx, tx, requirementID)
	if err != nil {
		return Requirement{}, err
	}

	rule := domain.FindTransitionRule(locked.RequirementType, locked.CurrentStatus, toStatus)
	if rule == nil {
		return Requirement{}, fmt.Errorf("invalid transition from %s to %s", locked.CurrentStatus, toStatus)
	}

	domainSub := submission.toDomain()

	// Role check
	if err := domain.ValidateTransitionOperator(
		operatorID,
		locked.CreatedBy,
		locked.DeveloperUserID,
		locked.TesterUserID,
		rule.RequiredStageCode,
	); err != nil {
		return Requirement{}, fmt.Errorf("permission denied: %w", err)
	}

	// Field validation
	if err := domain.ValidateStageSubmission(rule.RequiredStageCode, domainSub, toStatus); err != nil {
		return Requirement{}, fmt.Errorf("stage submission invalid: %w", err)
	}

	// A requirement can only advance past testing / acceptance once every bug
	// sub-item is COMPLETED.
	if locked.RequirementType == domain.ItemTypeRequirement && domain.StagesRequiringBugCheck[rule.RequiredStageCode] {
		if toStatus == domain.StatusProductAcceptance || toStatus == domain.StatusRegression {
			openCount, err := r.countOpenBugsTx(ctx, tx, requirementID)
			if err != nil {
				return Requirement{}, err
			}
			if err := domain.CheckAllBugsCompleted(openCount); err != nil {
				return Requirement{}, err
			}
		}
	}

	// Resolve the development track / assignees this submission may set.
	developmentType := locked.DevelopmentType
	if candidate, err := domain.NormalizeDevelopmentType(submission.DevelopmentType); err != nil {
		return Requirement{}, err
	} else if candidate != "" {
		developmentType = candidate
	}
	developerUserID := locked.DeveloperUserID
	if submission.DeveloperUserID > 0 {
		developerUserID = submission.DeveloperUserID
	}
	testerUserID := locked.TesterUserID
	if submission.TesterUserID > 0 {
		testerUserID = submission.TesterUserID
	}

	// Entering development requires a single track and its owning developer.
	if toStatus == domain.StatusDevelopment && locked.CurrentStatus == domain.StatusDevDesign {
		if err := domain.ValidateDevelopmentReadiness(developmentType, developerUserID); err != nil {
			return Requirement{}, err
		}
	}

	submissionID, err := insertStageSubmission(ctx, tx, stageSubmissionRow{
		RequirementID:  requirementID,
		StageCode:      rule.RequiredStageCode,
		Result:         domain.StageResult(rule.RequiredStageCode, domainSub),
		Content:        domainSub.ContentMap(),
		OperatorUserID: operatorID,
	})
	if err != nil {
		return Requirement{}, err
	}

	assignments := []string{"current_status = ?", "status_version = status_version + 1"}
	args := []any{toStatus}

	assignments = append(assignments, "development_type = ?")
	args = append(args, nullIfEmpty(developmentType))
	assignments = append(assignments, "developer_user_id = ?")
	args = append(args, nullUint64(developerUserID))
	assignments = append(assignments, "tester_user_id = ?")
	args = append(args, nullUint64(testerUserID))

	if rule.RequiredStageCode == domain.StageRegression {
		assignments = append(assignments, "regression_result = ?")
		args = append(args, nullIfEmpty(strings.ToUpper(strings.TrimSpace(submission.RegressionResult))))
	}
	if domain.IsTerminalStatus(toStatus) {
		assignments = append(assignments, "completed_at = CURRENT_TIMESTAMP(3)")
	} else {
		assignments = append(assignments, "completed_at = NULL")
	}

	args = append(args, requirementID)
	if _, err := tx.ExecContext(ctx,
		`UPDATE requirements SET `+strings.Join(assignments, ", ")+` WHERE id = ?`, args...); err != nil {
		return Requirement{}, err
	}

	remark := strings.TrimSpace(submission.Remark)
	if remark == "" {
		remark = rule.Description
	}
	fromStatus := locked.CurrentStatus
	if err := insertStatusChangeLog(ctx, tx, statusChangeLogEntry{
		RequirementID:     requirementID,
		FromStatus:        &fromStatus,
		ToStatus:          toStatus,
		OperatorUserID:    operatorID,
		StageSubmissionID: submissionID,
		Remark:            remark,
	}); err != nil {
		return Requirement{}, err
	}

	if err := tx.Commit(); err != nil {
		return Requirement{}, err
	}
	return r.GetRequirement(ctx, requirementID)
}

// UpdateRegressionResult allows changing a FAIL regression result to PASS after the fact.
func (r *Repository) UpdateRegressionResult(ctx context.Context, requirementID, operatorID uint64, summary string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `
		UPDATE requirements SET regression_result = 'PASS' WHERE id = ?`, requirementID); err != nil {
		return err
	}

	content := domain.StageSubmissionInput{
		RegressionResult:  domain.ResultPass,
		RegressionSummary: summary,
		Remark:            "回归结果由 FAIL 更正为 PASS。",
	}.ContentMap()
	if _, err := insertStageSubmission(ctx, tx, stageSubmissionRow{
		RequirementID:  requirementID,
		StageCode:      domain.StageRegression,
		Result:         domain.ResultPass,
		Content:        content,
		OperatorUserID: operatorID,
	}); err != nil {
		return err
	}
	return tx.Commit()
}

// ── internal helpers ─────────────────────────────────────────────────────────

type lockedRequirement struct {
	RequirementType string
	CurrentStatus   string
	DevelopmentType string
	CreatedBy       uint64
	DeveloperUserID uint64
	TesterUserID    uint64
}

func (r *Repository) lockRequirementForTransition(ctx context.Context, tx *sql.Tx, requirementID uint64) (lockedRequirement, error) {
	var locked lockedRequirement
	var developmentType sql.NullString
	var developer, tester sql.NullInt64
	err := tx.QueryRowContext(ctx, `
		SELECT requirement_type, current_status, development_type,
		       created_by, developer_user_id, tester_user_id
		FROM requirements WHERE id = ? FOR UPDATE`, requirementID).
		Scan(&locked.RequirementType, &locked.CurrentStatus, &developmentType,
			&locked.CreatedBy, &developer, &tester)
	if err != nil {
		if err == sql.ErrNoRows {
			return lockedRequirement{}, fmt.Errorf("requirement not found")
		}
		return lockedRequirement{}, err
	}
	if developmentType.Valid {
		locked.DevelopmentType = developmentType.String
	}
	if developer.Valid {
		locked.DeveloperUserID = uint64(developer.Int64)
	}
	if tester.Valid {
		locked.TesterUserID = uint64(tester.Int64)
	}
	return locked, nil
}

func (r *Repository) countOpenBugsTx(ctx context.Context, tx *sql.Tx, parentRequirementID uint64) (int, error) {
	var count int
	err := tx.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM requirements
		WHERE parent_requirement_id = ? AND requirement_type = 'BUG' AND current_status <> 'COMPLETED'`,
		parentRequirementID).Scan(&count)
	return count, err
}

func defaultPriority(priority string) string {
	priority = strings.ToUpper(strings.TrimSpace(priority))
	if priority == "" {
		return "MEDIUM"
	}
	return priority
}

func validatePriority(priority string) error {
	switch strings.ToUpper(strings.TrimSpace(priority)) {
	case "LOW", "MEDIUM", "HIGH", "URGENT":
		return nil
	default:
		return fmt.Errorf("invalid priority")
	}
}
