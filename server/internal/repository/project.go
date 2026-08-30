package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/domain"
)

// ProjectMember is a project membership row.
type ProjectMember struct {
	ID        uint64   `json:"id"`
	UserID    uint64   `json:"user_id"`
	UserName  string   `json:"user_name"`
	RoleCode  string   `json:"role_code"`
	RoleCodes []string `json:"role_codes"`
	JoinedAt  string   `json:"joined_at,omitempty"`
}

// ProjectDetail extends Project with members.
type ProjectDetail struct {
	Project
	OwnerUserID uint64          `json:"owner_user_id"`
	Members     []ProjectMember `json:"members"`
}

// GetProject returns a project by id.
func (r *Repository) GetProject(ctx context.Context, projectID uint64) (ProjectDetail, error) {
	var detail ProjectDetail
	err := r.db.QueryRowContext(ctx, `
		SELECT id, project_code, name, IFNULL(description, ''), status, owner_user_id,
		       IFNULL(git_repo_url, ''), IFNULL(git_default_branch, ''),
		       IFNULL(wps_group_id, ''), IFNULL(wps_group_name, ''),
		       created_by,
		       DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ'),
		       DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%sZ')
		FROM projects WHERE id = ? AND status = 'ACTIVE'`, projectID).
		Scan(&detail.ID, &detail.ProjectCode, &detail.Name, &detail.Description, &detail.Status,
			&detail.OwnerUserID, &detail.GitRepoURL, &detail.GitDefaultBranch,
			&detail.WPSGroupID, &detail.WPSGroupName,
			&detail.CreatedBy, &detail.CreatedAt, &detail.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return ProjectDetail{}, fmt.Errorf("project not found")
		}
		return ProjectDetail{}, err
	}

	members, err := r.ListProjectMembers(ctx, projectID)
	if err != nil {
		return ProjectDetail{}, err
	}
	detail.Members = members
	reqCount, bugCount, err := r.projectItemCounts(ctx, projectID)
	if err != nil {
		return ProjectDetail{}, err
	}
	detail.RequirementCount = reqCount
	detail.BugCount = bugCount
	return detail, nil
}

// ListProjectMembers returns members for a project.
func (r *Repository) ListProjectMembers(ctx context.Context, projectID uint64) ([]ProjectMember, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, user_id, role_code, role_codes,
		       DATE_FORMAT(joined_at, '%Y-%m-%d')
		FROM project_members
		WHERE project_id = ?
		ORDER BY id`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]ProjectMember, 0)
	userIDs := make([]uint64, 0)
	for rows.Next() {
		var item ProjectMember
		var roleCodesJSON []byte
		if err := rows.Scan(&item.ID, &item.UserID, &item.RoleCode, &roleCodesJSON, &item.JoinedAt); err != nil {
			return nil, err
		}
		item.RoleCodes = decodeRoleCodes(roleCodesJSON, item.RoleCode)
		items = append(items, item)
		userIDs = append(userIDs, item.UserID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	names, err := r.mapUserDisplayNames(ctx, userIDs)
	if err != nil {
		return nil, err
	}
	for i := range items {
		items[i].UserName = names[items[i].UserID]
	}
	return items, nil
}

func (r *Repository) attachProjectListExtras(ctx context.Context, projects []ProjectDetail, ids []uint64) error {
	if len(ids) == 0 {
		return nil
	}
	byID := make(map[uint64]*ProjectDetail, len(projects))
	for i := range projects {
		byID[projects[i].ID] = &projects[i]
	}
	for i := range projects {
		members, err := r.ListProjectMembers(ctx, projects[i].ID)
		if err != nil {
			return err
		}
		projects[i].Members = members
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT project_id,
		       SUM(CASE WHEN development_scope = 'BUG_FIX' THEN 1 ELSE 0 END),
		       SUM(CASE WHEN development_scope <> 'BUG_FIX' THEN 1 ELSE 0 END)
		FROM requirements
		WHERE archived_at IS NULL AND project_id IN (`+placeholders(len(ids))+`)
		GROUP BY project_id`, uint64Args(ids)...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var projectID uint64
		var bugCount, reqCount int
		if err := rows.Scan(&projectID, &bugCount, &reqCount); err != nil {
			return err
		}
		if item, ok := byID[projectID]; ok {
			item.BugCount = bugCount
			item.RequirementCount = reqCount
		}
	}
	return rows.Err()
}

func (r *Repository) projectItemCounts(ctx context.Context, projectID uint64) (int, int, error) {
	var reqCount, bugCount int
	err := r.db.QueryRowContext(ctx, `
		SELECT
		  COALESCE(SUM(CASE WHEN development_scope <> 'BUG_FIX' THEN 1 ELSE 0 END), 0),
		  COALESCE(SUM(CASE WHEN development_scope = 'BUG_FIX' THEN 1 ELSE 0 END), 0)
		FROM requirements
		WHERE project_id = ? AND archived_at IS NULL`, projectID).
		Scan(&reqCount, &bugCount)
	if err != nil {
		return 0, 0, err
	}
	return reqCount, bugCount, nil
}

func decodeRoleCodes(raw []byte, fallbackRole string) []string {
	if len(raw) == 0 {
		return legacyRoleToUI(fallbackRole)
	}
	var codes []string
	if err := json.Unmarshal(raw, &codes); err != nil || len(codes) == 0 {
		return legacyRoleToUI(fallbackRole)
	}
	return codes
}

func legacyRoleToUI(roleCode string) []string {
	switch roleCode {
	case "PROJECT_ADMIN":
		return []string{domain.UIRoleProjectAdmin}
	default:
		return []string{domain.UIRoleMember}
	}
}

func encodeRoleCodes(codes []string) (string, error) {
	raw, err := json.Marshal(codes)
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

// CreateProjectInput holds fields for creating a project.
type CreateProjectInput struct {
	OrganizationID uint64
	ProjectCode    string
	Name           string
	Description    string
	OwnerUserID    uint64
	CreatedBy      uint64
}

// CreateProject inserts a new project and owner membership. Returns the new project id.
func (r *Repository) CreateProject(ctx context.Context, input CreateProjectInput) (uint64, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()

	result, err := tx.ExecContext(ctx, `
		INSERT INTO projects (organization_id, project_code, name, description, owner_user_id, status, setup_status, created_by)
		VALUES (?, ?, ?, ?, ?, 'ACTIVE', 'CREATED', ?)`,
		input.OrganizationID, input.ProjectCode, input.Name, input.Description,
		input.OwnerUserID, input.CreatedBy)
	if err != nil {
		return 0, err
	}
	insertedID, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO project_members (project_id, user_id, role_code, role_codes, invited_by)
		VALUES (?, ?, 'PROJECT_ADMIN', JSON_ARRAY('PROJECT_ADMIN'), ?)`,
		insertedID, input.OwnerUserID, input.CreatedBy)
	if err != nil {
		return 0, err
	}

	for _, step := range domain.ProjectSetupSteps {
		completed := step.StepCode == domain.ProjectStepCreateProject
		var completedBy any
		var note any
		if completed {
			completedBy = input.CreatedBy
			note = "项目基础信息已填写"
		}
		_, err = tx.ExecContext(ctx, `
			INSERT INTO project_setup_steps (project_id, step_code, completed, wps_related, completed_by, note)
			VALUES (?, ?, ?, ?, ?, ?)`,
			insertedID, step.StepCode, boolToTinyInt(completed), boolToTinyInt(step.WPSRelated), completedBy, note)
		if err != nil {
			return 0, err
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}

	return uint64(insertedID), nil
}

func boolToTinyInt(v bool) int {
	if v {
		return 1
	}
	return 0
}

// GetProjectMemberRole returns the role_code for a user in a project, or empty if not a member.
func (r *Repository) GetProjectMemberRole(ctx context.Context, projectID, userID uint64) (string, error) {
	var roleCode string
	err := r.db.QueryRowContext(ctx, `
		SELECT role_code FROM project_members
		WHERE project_id = ? AND user_id = ?`, projectID, userID).Scan(&roleCode)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return roleCode, nil
}

// MemberCanManageProject reports whether the user can manage project members.
func (r *Repository) MemberCanManageProject(ctx context.Context, projectID, userID uint64) (bool, error) {
	members, err := r.ListProjectMembers(ctx, projectID)
	if err != nil {
		return false, err
	}
	for _, m := range members {
		if m.UserID != userID {
			continue
		}
		for _, code := range m.RoleCodes {
			if code == domain.UIRoleProjectAdmin {
				return true, nil
			}
		}
		if m.RoleCode == "PROJECT_ADMIN" {
			return true, nil
		}
	}
	return false, nil
}

// AddProjectMemberInput holds fields for adding a project member.
type AddProjectMemberInput struct {
	ProjectID uint64
	UserID    uint64
	RoleCodes []string
	InvitedBy uint64
}

// AddProjectMember inserts a membership and may complete the ADD_MEMBERS setup step.
func (r *Repository) AddProjectMember(ctx context.Context, input AddProjectMemberInput) (ProjectMember, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return ProjectMember{}, err
	}
	defer func() { _ = tx.Rollback() }()

	var exists int
	err = tx.QueryRowContext(ctx, `
		SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ? LIMIT 1`,
		input.ProjectID, input.UserID).Scan(&exists)
	if err == nil {
		return ProjectMember{}, fmt.Errorf("user is already a project member")
	}
	if err != sql.ErrNoRows {
		return ProjectMember{}, err
	}

	result, err := tx.ExecContext(ctx, `
		INSERT INTO project_members (project_id, user_id, role_code, role_codes, invited_by)
		VALUES (?, ?, ?, CAST(? AS JSON), ?)`,
		input.ProjectID, input.UserID, domain.PrimaryRoleCode(input.RoleCodes),
		mustEncodeRoleCodes(input.RoleCodes), input.InvitedBy)
	if err != nil {
		return ProjectMember{}, err
	}
	memberID, err := result.LastInsertId()
	if err != nil {
		return ProjectMember{}, err
	}

	var userName string
	err = tx.QueryRowContext(ctx, `
		SELECT COALESCE(NULLIF(nick_name, ''), name) FROM users WHERE id = ?`, input.UserID).
		Scan(&userName)
	if err != nil {
		return ProjectMember{}, err
	}

	if err := maybeCompleteAddMembersStep(ctx, tx, input.ProjectID, input.InvitedBy); err != nil {
		return ProjectMember{}, err
	}

	if err := tx.Commit(); err != nil {
		return ProjectMember{}, err
	}

	return ProjectMember{
		ID:        uint64(memberID),
		UserID:    input.UserID,
		UserName:  userName,
		RoleCode:  domain.PrimaryRoleCode(input.RoleCodes),
		RoleCodes: append([]string(nil), input.RoleCodes...),
	}, nil
}

func mustEncodeRoleCodes(codes []string) string {
	raw, err := encodeRoleCodes(codes)
	if err != nil {
		return "[]"
	}
	return raw
}

// UpdateProjectMemberRoles changes a member's UI role tags.
func (r *Repository) UpdateProjectMemberRoles(ctx context.Context, projectID, memberID uint64, roleCodes []string) (ProjectMember, error) {
	encoded, err := encodeRoleCodes(roleCodes)
	if err != nil {
		return ProjectMember{}, err
	}
	result, err := r.db.ExecContext(ctx, `
		UPDATE project_members SET role_code = ?, role_codes = CAST(? AS JSON)
		WHERE id = ? AND project_id = ?`,
		domain.PrimaryRoleCode(roleCodes), encoded, memberID, projectID)
	if err != nil {
		return ProjectMember{}, err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return ProjectMember{}, err
	}
	if affected == 0 {
		return ProjectMember{}, fmt.Errorf("member not found")
	}

	members, err := r.ListProjectMembers(ctx, projectID)
	if err != nil {
		return ProjectMember{}, err
	}
	for _, m := range members {
		if m.ID == memberID {
			return m, nil
		}
	}
	return ProjectMember{}, fmt.Errorf("member not found")
}

// RemoveProjectMember deletes a membership if not the sole product owner.
func (r *Repository) RemoveProjectMember(ctx context.Context, projectID, memberID uint64) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var roleCode string
	var userID uint64
	err = tx.QueryRowContext(ctx, `
		SELECT role_code, user_id FROM project_members
		WHERE id = ? AND project_id = ?`, memberID, projectID).
		Scan(&roleCode, &userID)
	if err == sql.ErrNoRows {
		return fmt.Errorf("member not found")
	}
	if err != nil {
		return err
	}

	if roleCode == "PROJECT_ADMIN" {
		var adminCount int
		err = tx.QueryRowContext(ctx, `
			SELECT COUNT(*) FROM project_members
			WHERE project_id = ? AND role_code = 'PROJECT_ADMIN'`, projectID).
			Scan(&adminCount)
		if err != nil {
			return err
		}
		if adminCount <= 1 {
			return fmt.Errorf("cannot remove the sole project manager")
		}
	}

	if err := clearMemberAssignments(ctx, tx, projectID, userID); err != nil {
		return err
	}

	result, err := tx.ExecContext(ctx, `
		DELETE FROM project_members WHERE id = ? AND project_id = ?`, memberID, projectID)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return fmt.Errorf("member not found")
	}

	return tx.Commit()
}

func maybeCompleteAddMembersStep(ctx context.Context, tx *sql.Tx, projectID, operatorID uint64) error {
	var memberCount int
	err := tx.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM project_members WHERE project_id = ?`, projectID).
		Scan(&memberCount)
	if err != nil {
		return err
	}
	if memberCount < 2 {
		return nil
	}

	_, err = tx.ExecContext(ctx, `
		UPDATE project_setup_steps
		SET completed = 1, completed_at = CURRENT_TIMESTAMP(3), completed_by = ?,
		    note = '已添加项目成员'
		WHERE project_id = ? AND step_code = ? AND completed = 0`,
		operatorID, projectID, domain.ProjectStepAddMembers)
	if err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx, `
		UPDATE projects SET setup_status = 'MEMBERS_CONFIGURED'
		WHERE id = ? AND setup_status = 'CREATED'`, projectID)
	return err
}

// UpdateProjectSetupInput holds optional project setup fields.
type UpdateProjectSetupInput struct {
	Name             *string
	Description      *string
	GitRepoURL       *string
	GitDefaultBranch *string
	WPSGroupID       *string
	WPSGroupName     *string
}

// UpdateProjectSetup updates project basic info and optional repository/group fields.
func (r *Repository) UpdateProjectSetup(ctx context.Context, projectID uint64, input UpdateProjectSetupInput) (ProjectDetail, error) {
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return ProjectDetail{}, fmt.Errorf("name is required")
		}
		_, err := r.db.ExecContext(ctx, `
			UPDATE projects SET name = ? WHERE id = ? AND status = 'ACTIVE'`,
			name, projectID)
		if err != nil {
			return ProjectDetail{}, err
		}
	}
	if input.Description != nil {
		_, err := r.db.ExecContext(ctx, `
			UPDATE projects SET description = ? WHERE id = ? AND status = 'ACTIVE'`,
			nullIfEmptyString(*input.Description), projectID)
		if err != nil {
			return ProjectDetail{}, err
		}
	}
	if input.GitRepoURL != nil {
		_, err := r.db.ExecContext(ctx, `
			UPDATE projects SET git_repo_url = ? WHERE id = ? AND status = 'ACTIVE'`,
			nullIfEmptyString(*input.GitRepoURL), projectID)
		if err != nil {
			return ProjectDetail{}, err
		}
	}
	if input.GitDefaultBranch != nil {
		_, err := r.db.ExecContext(ctx, `
			UPDATE projects SET git_default_branch = ? WHERE id = ? AND status = 'ACTIVE'`,
			nullIfEmptyString(*input.GitDefaultBranch), projectID)
		if err != nil {
			return ProjectDetail{}, err
		}
	}
	if input.WPSGroupID != nil {
		_, err := r.db.ExecContext(ctx, `
			UPDATE projects SET wps_group_id = ? WHERE id = ? AND status = 'ACTIVE'`,
			nullIfEmptyString(*input.WPSGroupID), projectID)
		if err != nil {
			return ProjectDetail{}, err
		}
	}
	if input.WPSGroupName != nil {
		_, err := r.db.ExecContext(ctx, `
			UPDATE projects SET wps_group_name = ? WHERE id = ? AND status = 'ACTIVE'`,
			nullIfEmptyString(*input.WPSGroupName), projectID)
		if err != nil {
			return ProjectDetail{}, err
		}
	}
	return r.GetProject(ctx, projectID)
}

func nullIfEmptyString(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return strings.TrimSpace(value)
}
