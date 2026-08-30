package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/domain"
)

// Bug is a bug row.
type Bug struct {
	ID               uint64  `json:"id"`
	ProjectID        uint64  `json:"project_id"`
	RequirementID    uint64  `json:"requirement_id"`
	BugCode          string  `json:"bug_code"`
	Title            string  `json:"title"`
	Description      string  `json:"description"`
	StepsToReproduce string  `json:"steps_to_reproduce"`
	Environment      string  `json:"environment"`
	Severity         string  `json:"severity"`
	Status           string  `json:"status"`
	FoundInStatus    string  `json:"found_in_status"`
	AssigneeUserID   *uint64 `json:"assignee_user_id,omitempty"`
	FixRequirementID *uint64 `json:"fix_requirement_id,omitempty"`
}

const bugSelectColumns = `
	id, project_id, requirement_id, bug_code, title,
	description, steps_to_reproduce, environment, severity, status, found_in_status,
	assignee_user_id, fix_requirement_id
`

func scanBug(row scanner) (Bug, error) {
	var item Bug
	var assignee, fixReq sql.NullInt64
	err := row.Scan(
		&item.ID, &item.ProjectID, &item.RequirementID, &item.BugCode, &item.Title,
		&item.Description, &item.StepsToReproduce, &item.Environment,
		&item.Severity, &item.Status, &item.FoundInStatus,
		&assignee, &fixReq,
	)
	if err != nil {
		return Bug{}, err
	}
	if assignee.Valid {
		v := uint64(assignee.Int64)
		item.AssigneeUserID = &v
	}
	if fixReq.Valid {
		v := uint64(fixReq.Int64)
		item.FixRequirementID = &v
	}
	return item, nil
}

// ListBugs returns bugs for a project.
func (r *Repository) ListBugs(ctx context.Context, projectID uint64) ([]Bug, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT `+bugSelectColumns+`
		FROM bugs
		WHERE project_id = ?
		ORDER BY id DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]Bug, 0)
	for rows.Next() {
		item, err := scanBug(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// ListBugsByRequirement returns bugs linked to a main requirement.
func (r *Repository) ListBugsByRequirement(ctx context.Context, requirementID uint64) ([]Bug, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT `+bugSelectColumns+`
		FROM bugs
		WHERE requirement_id = ?
		ORDER BY id DESC`, requirementID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]Bug, 0)
	for rows.Next() {
		item, err := scanBug(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// ListChildRequirements returns bug-fix (or other) child requirements.
func (r *Repository) ListChildRequirements(ctx context.Context, parentID uint64) ([]Requirement, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT `+requirementSelectColumns+`
		FROM requirements
		WHERE parent_requirement_id = ? AND archived_at IS NULL
		ORDER BY id DESC`, parentID)
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

// GetBug returns a bug by id.
func (r *Repository) GetBug(ctx context.Context, bugID uint64) (Bug, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT `+bugSelectColumns+`
		FROM bugs WHERE id = ?`, bugID)
	item, err := scanBug(row)
	if err != nil {
		if err == sql.ErrNoRows {
			return Bug{}, fmt.Errorf("bug not found")
		}
		return Bug{}, err
	}
	return item, nil
}

// CreateBugInput holds fields for creating a bug.
type CreateBugInput struct {
	ProjectID               uint64
	RequirementID           uint64
	Title                   string
	Description             string
	StepsToReproduce        string
	Environment             string
	Severity                string
	ReporterUserID          uint64
	AssigneeUserID          uint64
	SecondaryAssigneeUserID uint64
}

// CreateBugWithFixResult is returned when test failure creates a bug + fix requirement.
type CreateBugWithFixResult struct {
	Bug             Bug         `json:"bug"`
	FixRequirement  Requirement `json:"fix_requirement"`
	MainRequirement Requirement `json:"main_requirement"`
}

// BugRetestResult is returned after the assigned tester verifies a fixed bug.
type BugRetestResult struct {
	Bug             Bug         `json:"bug"`
	FixRequirement  Requirement `json:"fix_requirement"`
	MainRequirement Requirement `json:"main_requirement"`
}

// CreateBugWithFixRequirement creates a bug, a linked BUG_FIX child requirement,
// and moves the main requirement into BUG_FIXING (if still in TESTING).
func (r *Repository) CreateBugWithFixRequirement(ctx context.Context, input CreateBugInput) (CreateBugWithFixResult, error) {
	severity := strings.TrimSpace(input.Severity)
	if severity == "" {
		severity = "HIGH"
	}
	steps := strings.TrimSpace(input.StepsToReproduce)
	if steps == "" {
		steps = "见问题描述"
	}
	env := strings.TrimSpace(input.Environment)
	if env == "" {
		env = "SIT"
	}
	title := strings.TrimSpace(input.Title)
	description := strings.TrimSpace(input.Description)
	if description == "" {
		description = title
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return CreateBugWithFixResult{}, err
	}
	defer func() { _ = tx.Rollback() }()

	fromStatus, roles, err := r.lockRequirementForTransition(ctx, tx, input.RequirementID)
	if err != nil {
		return CreateBugWithFixResult{}, err
	}
	if fromStatus != domain.StatusTesting && fromStatus != domain.StatusBugFixing {
		return CreateBugWithFixResult{}, fmt.Errorf("bugs can only be created when main requirement is TESTING or BUG_FIXING (current: %s)", fromStatus)
	}
	if roles.TesterUserID != 0 && input.ReporterUserID != roles.TesterUserID {
		return CreateBugWithFixResult{}, fmt.Errorf("permission denied: only the assigned tester can submit bugs")
	}

	var projectID uint64
	var parentCode, parentTitle string
	var parentPO, parentFE, parentBE, parentTester sql.NullInt64
	err = tx.QueryRowContext(ctx, `
		SELECT project_id, requirement_code, title,
		       product_owner_user_id, developer_user_id, backend_developer_user_id, tester_user_id
		FROM requirements WHERE id = ? AND archived_at IS NULL`, input.RequirementID).
		Scan(&projectID, &parentCode, &parentTitle, &parentPO, &parentFE, &parentBE, &parentTester)
	if err != nil {
		return CreateBugWithFixResult{}, err
	}
	if projectID != input.ProjectID {
		return CreateBugWithFixResult{}, fmt.Errorf("requirement does not belong to project")
	}

	assigneeID := input.AssigneeUserID
	if assigneeID == 0 {
		if parentBE.Valid {
			assigneeID = uint64(parentBE.Int64)
		} else if parentFE.Valid {
			assigneeID = uint64(parentFE.Int64)
		}
	}
	if assigneeID == 0 {
		return CreateBugWithFixResult{}, fmt.Errorf("assignee_user_id is required")
	}
	secondaryAssigneeID := input.SecondaryAssigneeUserID
	if secondaryAssigneeID > 0 && secondaryAssigneeID == assigneeID {
		return CreateBugWithFixResult{}, fmt.Errorf("primary and secondary assignees must be different")
	}

	var count int
	if err := tx.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM bugs WHERE project_id = ?`, projectID).Scan(&count); err != nil {
		return CreateBugWithFixResult{}, err
	}
	bugCode := fmt.Sprintf("BUG-%03d", count+1)

	bugResult, err := tx.ExecContext(ctx, `
		INSERT INTO bugs (
			project_id, requirement_id, bug_code, title, description,
			steps_to_reproduce, environment, severity, status, found_in_status,
			reporter_user_id, assignee_user_id
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', 'TESTING', ?, ?)`,
		projectID, input.RequirementID, bugCode, title, description,
		steps, env, severity, input.ReporterUserID, assigneeID)
	if err != nil {
		return CreateBugWithFixResult{}, err
	}
	bugID64, err := bugResult.LastInsertId()
	if err != nil {
		return CreateBugWithFixResult{}, err
	}
	bugID := uint64(bugID64)

	var reqCount int
	if err := tx.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM requirements WHERE project_id = ?`, projectID).Scan(&reqCount); err != nil {
		return CreateBugWithFixResult{}, err
	}
	fixCode := fmt.Sprintf("BUGFIX-%03d", reqCount+1)
	fixTitle := fmt.Sprintf("[%s] 修复：%s", bugCode, title)
	fixDesc := fmt.Sprintf("关联主需求 %s（%s）。\n缺陷：%s\n\n%s\n\n复现步骤：\n%s",
		parentCode, parentTitle, bugCode, description, steps)

	var feID, beID any
	assignFixDeveloper := func(userID uint64) {
		if userID == 0 {
			return
		}
		if parentFE.Valid && uint64(parentFE.Int64) == userID {
			feID = userID
			return
		}
		if parentBE.Valid && uint64(parentBE.Int64) == userID {
			beID = userID
			return
		}
		if feID == nil {
			feID = userID
		} else {
			beID = userID
		}
	}
	assignFixDeveloper(assigneeID)
	assignFixDeveloper(secondaryAssigneeID)
	var poID, testerID any
	if parentPO.Valid {
		poID = parentPO.Int64
	}
	if parentTester.Valid {
		testerID = parentTester.Int64
	}

	fixResult, err := tx.ExecContext(ctx, `
		INSERT INTO requirements (
			project_id, requirement_code, title, description, priority, development_scope,
			current_status, product_owner_user_id, developer_user_id, backend_developer_user_id,
			tester_user_id, parent_requirement_id, created_by
		) VALUES (?, ?, ?, ?, ?, ?, 'DEVELOPMENT', ?, ?, ?, ?, ?, ?)`,
		projectID, fixCode, fixTitle, fixDesc, severityToPriority(severity), domain.ScopeBugFix,
		poID, feID, beID, testerID, input.RequirementID, input.ReporterUserID)
	if err != nil {
		return CreateBugWithFixResult{}, err
	}
	fixID64, err := fixResult.LastInsertId()
	if err != nil {
		return CreateBugWithFixResult{}, err
	}
	fixID := uint64(fixID64)

	if _, err := tx.ExecContext(ctx, `
		UPDATE bugs SET fix_requirement_id = ? WHERE id = ?`, fixID, bugID); err != nil {
		return CreateBugWithFixResult{}, err
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO requirement_stage_submissions (
			requirement_id, stage_code,
			spec_body, acceptance_criteria, product_owner_user_id,
			operator_user_id, submitted_at
		) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))`,
		fixID, domain.StageProductEditing,
		fixDesc, "缺陷已修复并通过自测，可提交完成。", poID, input.ReporterUserID)
	if err != nil {
		return CreateBugWithFixResult{}, err
	}

	if fromStatus == domain.StatusTesting {
		submission := StageSubmissionInput{
			TestSummary:      fmt.Sprintf("测试失败，已创建缺陷 %s 并进入 Bug 修复。", bugCode),
			TestResult:       domain.TestFail,
			TesterUserID:     roles.TesterUserID,
			TestCasesCovered: "见缺陷单与失败用例",
			Remark:           fmt.Sprintf("创建 %s / %s，主需求进入 BUG_FIXING", bugCode, fixCode),
		}
		if submission.TesterUserID == 0 {
			submission.TesterUserID = input.ReporterUserID
		}
		domainSub := toDomainSubmission(submission)
		if err := domain.ValidateStageSubmission(domain.StageTesting, domainSub, domain.StatusBugFixing); err != nil {
			return CreateBugWithFixResult{}, fmt.Errorf("stage submission invalid: %w", err)
		}
		submissionID, err := r.upsertStageSubmissionTx(ctx, tx, input.RequirementID, domain.StageTesting, input.ReporterUserID, submission)
		if err != nil {
			return CreateBugWithFixResult{}, err
		}
		if _, err := tx.ExecContext(ctx, `
			UPDATE requirements SET current_status = ?, status_version = status_version + 1 WHERE id = ?`,
			domain.StatusBugFixing, input.RequirementID); err != nil {
			return CreateBugWithFixResult{}, err
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO status_change_log (
				resource_type, resource_id, from_status, to_status, operator_user_id, remark, stage_submission_id
			) VALUES ('REQUIREMENT', ?, ?, ?, ?, ?, ?)`,
			input.RequirementID, domain.StatusTesting, domain.StatusBugFixing,
			input.ReporterUserID, submission.Remark, submissionID); err != nil {
			return CreateBugWithFixResult{}, err
		}
	}

	if err := tx.Commit(); err != nil {
		return CreateBugWithFixResult{}, err
	}

	bug, err := r.GetBug(ctx, bugID)
	if err != nil {
		return CreateBugWithFixResult{}, err
	}
	fixReq, err := r.GetRequirement(ctx, fixID)
	if err != nil {
		return CreateBugWithFixResult{}, err
	}
	mainReq, err := r.GetRequirement(ctx, input.RequirementID)
	if err != nil {
		return CreateBugWithFixResult{}, err
	}
	return CreateBugWithFixResult{
		Bug:             bug,
		FixRequirement:  fixReq,
		MainRequirement: mainReq,
	}, nil
}

// CompleteBugFix marks the fix requirement done and the linked bug FIXED.
func (r *Repository) CompleteBugFix(
	ctx context.Context,
	fixRequirementID, operatorID uint64,
	summary, notes string,
) (Requirement, Bug, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return Requirement{}, Bug{}, err
	}
	defer func() { _ = tx.Rollback() }()

	status, roles, err := r.lockRequirementForTransition(ctx, tx, fixRequirementID)
	if err != nil {
		return Requirement{}, Bug{}, err
	}
	scope, err := r.getRequirementScopeTx(ctx, tx, fixRequirementID)
	if err != nil {
		return Requirement{}, Bug{}, err
	}
	if scope != domain.ScopeBugFix {
		return Requirement{}, Bug{}, fmt.Errorf("requirement is not a BUG_FIX requirement")
	}
	if status != domain.StatusDevelopment {
		return Requirement{}, Bug{}, fmt.Errorf("fix requirement must be in DEVELOPMENT (current: %s)", status)
	}

	stageCode := ""
	switch operatorID {
	case roles.DeveloperUserID:
		stageCode = domain.StageDevelopmentFrontend
	case roles.BackendDeveloperUserID:
		stageCode = domain.StageDevelopmentBackend
	default:
		return Requirement{}, Bug{}, fmt.Errorf("permission denied: only the assigned developer can complete the fix")
	}

	summary = strings.TrimSpace(summary)
	if summary == "" {
		summary = "缺陷已修复，请复测。"
	}
	notes = strings.TrimSpace(notes)
	if notes == "" {
		notes = "已完成代码修复与自测。"
	}

	if _, err := r.upsertStageSubmissionTx(ctx, tx, fixRequirementID, stageCode, operatorID, StageSubmissionInput{
		DevSummary:          summary,
		ImplementationNotes: notes,
		DeveloperUserID:     operatorID,
	}); err != nil {
		return Requirement{}, Bug{}, err
	}

	frontendDone, backendDone, err := developmentCompletionStateTx(ctx, tx, fixRequirementID)
	if err != nil {
		return Requirement{}, Bug{}, err
	}
	allRequiredDone := (roles.DeveloperUserID == 0 || frontendDone) &&
		(roles.BackendDeveloperUserID == 0 || backendDone)

	if err := tx.Commit(); err != nil {
		return Requirement{}, Bug{}, err
	}

	if !allRequiredDone {
		updated, err := r.GetRequirement(ctx, fixRequirementID)
		if err != nil {
			return Requirement{}, Bug{}, err
		}
		bug, err := r.getBugByFixRequirement(ctx, fixRequirementID)
		if err != nil {
			return updated, Bug{}, err
		}
		return updated, bug, nil
	}

	primaryDev := roles.DeveloperUserID
	if primaryDev == 0 {
		primaryDev = roles.BackendDeveloperUserID
	}
	updated, err := r.TransitionRequirementStatus(ctx, fixRequirementID, operatorID, domain.StatusDone, StageSubmissionInput{
		DevSummary:          "所有指派研发均已提交缺陷修复完成。",
		ImplementationNotes: "修复负责人完成状态已全部校验，等待测试回归。",
		DeveloperUserID:     primaryDev,
		Remark:              "缺陷修复完成",
	})
	if err != nil {
		return Requirement{}, Bug{}, err
	}

	bugTx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return Requirement{}, Bug{}, err
	}
	defer func() { _ = bugTx.Rollback() }()

	result, err := bugTx.ExecContext(ctx, `
		UPDATE bugs SET status = 'FIXED', updated_at = CURRENT_TIMESTAMP(3)
		WHERE fix_requirement_id = ? AND status IN ('OPEN', 'IN_PROGRESS')`, fixRequirementID)
	if err != nil {
		return Requirement{}, Bug{}, err
	}
	affected, _ := result.RowsAffected()
	if err := bugTx.Commit(); err != nil {
		return Requirement{}, Bug{}, err
	}

	bug, err := r.getBugByFixRequirement(ctx, fixRequirementID)
	if err != nil {
		if affected > 0 {
			return updated, Bug{}, err
		}
		return updated, Bug{}, nil
	}
	return updated, bug, nil
}

func (r *Repository) getBugByFixRequirement(ctx context.Context, fixRequirementID uint64) (Bug, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT `+bugSelectColumns+`
		FROM bugs WHERE fix_requirement_id = ? ORDER BY id DESC LIMIT 1`, fixRequirementID)
	bug, err := scanBug(row)
	if err == sql.ErrNoRows {
		return Bug{}, fmt.Errorf("linked bug not found")
	}
	return bug, err
}

// ResumeTestingFromBugFix moves main requirement BUG_FIXING → TESTING after all linked fix bugs are fixed.
func (r *Repository) ResumeTestingFromBugFix(ctx context.Context, mainRequirementID, operatorID uint64, remark string) (Requirement, error) {
	bugs, err := r.ListBugsByRequirement(ctx, mainRequirementID)
	if err != nil {
		return Requirement{}, err
	}
	linked := make([]Bug, 0)
	for _, b := range bugs {
		if b.FixRequirementID != nil && *b.FixRequirementID > 0 {
			linked = append(linked, b)
		}
	}
	if len(linked) == 0 {
		return Requirement{}, fmt.Errorf("no linked bug-fix requirements for this requirement")
	}
	for _, b := range linked {
		status := strings.ToUpper(b.Status)
		if status != "FIXED" && status != "VERIFIED" && status != "CLOSED" {
			return Requirement{}, fmt.Errorf("bug %s is still %s; all bugs must be FIXED before resume testing", b.BugCode, b.Status)
		}
	}

	remark = strings.TrimSpace(remark)
	if remark == "" {
		remark = "缺陷修复已确认，返回测试复验"
	}

	return r.TransitionRequirementStatus(ctx, mainRequirementID, operatorID, domain.StatusTesting, StageSubmissionInput{
		Remark: remark,
	})
}

// SubmitBugRetest synchronizes a tester's regression result across the bug,
// its fix requirement and the parent requirement.
func (r *Repository) SubmitBugRetest(
	ctx context.Context,
	bugID, operatorID uint64,
	passed bool,
	remark string,
) (BugRetestResult, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return BugRetestResult{}, err
	}
	defer func() { _ = tx.Rollback() }()

	var mainRequirementID uint64
	var fixRequirementIDValue sql.NullInt64
	var bugStatus string
	err = tx.QueryRowContext(ctx, `
		SELECT requirement_id, fix_requirement_id, status
		FROM bugs
		WHERE id = ?
		FOR UPDATE`, bugID).
		Scan(&mainRequirementID, &fixRequirementIDValue, &bugStatus)
	if err != nil {
		if err == sql.ErrNoRows {
			return BugRetestResult{}, fmt.Errorf("bug not found")
		}
		return BugRetestResult{}, err
	}
	if !fixRequirementIDValue.Valid || fixRequirementIDValue.Int64 <= 0 {
		return BugRetestResult{}, fmt.Errorf("bug has no fix requirement")
	}
	fixRequirementID := uint64(fixRequirementIDValue.Int64)
	if strings.ToUpper(bugStatus) != "FIXED" {
		return BugRetestResult{}, fmt.Errorf("only FIXED bugs can be retested (current: %s)", bugStatus)
	}

	var mainStatus string
	var testerID sql.NullInt64
	err = tx.QueryRowContext(ctx, `
		SELECT current_status, tester_user_id
		FROM requirements
		WHERE id = ? AND archived_at IS NULL
		FOR UPDATE`, mainRequirementID).
		Scan(&mainStatus, &testerID)
	if err != nil {
		return BugRetestResult{}, err
	}
	if !testerID.Valid || uint64(testerID.Int64) != operatorID {
		return BugRetestResult{}, fmt.Errorf("permission denied: only the assigned tester can submit bug retest results")
	}
	if mainStatus != domain.StatusTesting {
		return BugRetestResult{}, fmt.Errorf("main requirement must be in TESTING (current: %s)", mainStatus)
	}

	var fixStatus string
	err = tx.QueryRowContext(ctx, `
		SELECT current_status
		FROM requirements
		WHERE id = ? AND archived_at IS NULL
		FOR UPDATE`, fixRequirementID).
		Scan(&fixStatus)
	if err != nil {
		return BugRetestResult{}, err
	}
	if fixStatus != domain.StatusDone {
		return BugRetestResult{}, fmt.Errorf("fix requirement must be DONE before retest (current: %s)", fixStatus)
	}

	remark = strings.TrimSpace(remark)
	if passed {
		if remark == "" {
			remark = "测试回归通过，Bug 自动关闭，关联修复需求同步验证完成"
		}
		if _, err := tx.ExecContext(ctx, `
			UPDATE bugs SET status = 'CLOSED', updated_at = CURRENT_TIMESTAMP(3)
			WHERE id = ?`, bugID); err != nil {
			return BugRetestResult{}, err
		}
		if _, err := tx.ExecContext(ctx, `
			UPDATE requirements
			SET current_status = ?, status_version = status_version + 1
			WHERE id = ?`, domain.StatusArchived, fixRequirementID); err != nil {
			return BugRetestResult{}, err
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO status_change_log (
				resource_type, resource_id, from_status, to_status, operator_user_id, remark
			) VALUES
				('BUG', ?, 'FIXED', 'CLOSED', ?, ?),
				('REQUIREMENT', ?, ?, ?, ?, ?)`,
			bugID, operatorID, remark,
			fixRequirementID, fixStatus, domain.StatusArchived, operatorID, remark); err != nil {
			return BugRetestResult{}, err
		}
	} else {
		if remark == "" {
			remark = "测试回归未通过，Bug 重新进入修复"
		}
		if _, err := tx.ExecContext(ctx, `
			UPDATE bugs SET status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP(3)
			WHERE id = ?`, bugID); err != nil {
			return BugRetestResult{}, err
		}
		if _, err := tx.ExecContext(ctx, `
			UPDATE requirements
			SET current_status = ?, status_version = status_version + 1
			WHERE id = ?`, domain.StatusDevelopment, fixRequirementID); err != nil {
			return BugRetestResult{}, err
		}
		if _, err := tx.ExecContext(ctx, `
			UPDATE requirements
			SET current_status = ?, status_version = status_version + 1
			WHERE id = ?`, domain.StatusBugFixing, mainRequirementID); err != nil {
			return BugRetestResult{}, err
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO status_change_log (
				resource_type, resource_id, from_status, to_status, operator_user_id, remark
			) VALUES
				('BUG', ?, 'FIXED', 'IN_PROGRESS', ?, ?),
				('REQUIREMENT', ?, ?, ?, ?, ?),
				('REQUIREMENT', ?, ?, ?, ?, ?)`,
			bugID, operatorID, remark,
			fixRequirementID, fixStatus, domain.StatusDevelopment, operatorID, remark,
			mainRequirementID, mainStatus, domain.StatusBugFixing, operatorID, remark); err != nil {
			return BugRetestResult{}, err
		}
	}

	if err := tx.Commit(); err != nil {
		return BugRetestResult{}, err
	}

	bug, err := r.GetBug(ctx, bugID)
	if err != nil {
		return BugRetestResult{}, err
	}
	fixRequirement, err := r.GetRequirement(ctx, fixRequirementID)
	if err != nil {
		return BugRetestResult{}, err
	}
	mainRequirement, err := r.GetRequirement(ctx, mainRequirementID)
	if err != nil {
		return BugRetestResult{}, err
	}
	return BugRetestResult{
		Bug:             bug,
		FixRequirement:  fixRequirement,
		MainRequirement: mainRequirement,
	}, nil
}

func severityToPriority(severity string) string {
	switch strings.ToUpper(strings.TrimSpace(severity)) {
	case "CRITICAL", "BLOCKER":
		return "CRITICAL"
	case "HIGH":
		return "HIGH"
	case "LOW":
		return "LOW"
	default:
		return "MEDIUM"
	}
}

// CreateBug is kept for compatibility; prefer CreateBugWithFixRequirement.
func (r *Repository) CreateBug(ctx context.Context, input CreateBugInput) (Bug, error) {
	result, err := r.CreateBugWithFixRequirement(ctx, input)
	if err != nil {
		return Bug{}, err
	}
	return result.Bug, nil
}
