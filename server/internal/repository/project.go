package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/domain"
)

// ProjectMember is a project membership row. project_members has no role
// column: role_code / role_codes are synthesized from projects.owner_user_id.
type ProjectMember struct {
	ID        uint64   `json:"id"`
	ProjectID uint64   `json:"project_id"`
	UserID    uint64   `json:"user_id"`
	UserName  string   `json:"user_name"`
	InvitedBy uint64   `json:"invited_by,omitempty"`
	JoinedAt  string   `json:"joined_at,omitempty"`
	RoleCode  string   `json:"role_code"`
	RoleCodes []string `json:"role_codes"`
}

// ProjectDetail extends Project with members and repositories.
type ProjectDetail struct {
	Project
	Members      []ProjectMember     `json:"members"`
	Repositories []ProjectRepository `json:"repositories,omitempty"`
}

const projectSelectColumns = `
	id, name, IFNULL(description, ''), owner_user_id,
	IFNULL(wps_group_id, ''), IFNULL(wps_group_name, ''), IFNULL(wps_doc_folder_id, ''),
	DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ'),
	DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%sZ')
`

func scanProject(row scanner, target *Project) error {
	err := row.Scan(
		&target.ID, &target.Name, &target.Description, &target.OwnerUserID,
		&target.WPSGroupID, &target.WPSGroupName, &target.WPSDocFolderID,
		&target.CreatedAt, &target.UpdatedAt,
	)
	if err != nil {
		return err
	}
	target.applyProjectCompatFields()
	return nil
}

// GetProject returns a project by id.
func (r *Repository) GetProject(ctx context.Context, projectID uint64) (ProjectDetail, error) {
	var detail ProjectDetail
	row := r.db.QueryRowContext(ctx, `
		SELECT `+projectSelectColumns+`
		FROM projects WHERE id = ?`, projectID)
	if err := scanProject(row, &detail.Project); err != nil {
		if err == sql.ErrNoRows {
			return ProjectDetail{}, fmt.Errorf("project not found")
		}
		return ProjectDetail{}, err
	}

	members, err := r.listProjectMembers(ctx, projectID, detail.OwnerUserID)
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
	if err := r.attachProjectRepositories(ctx, &detail); err != nil {
		return ProjectDetail{}, err
	}
	detail.RepositoryCount = len(detail.Repositories)
	return detail, nil
}

// ProjectOwnerUserID returns projects.owner_user_id.
func (r *Repository) ProjectOwnerUserID(ctx context.Context, projectID uint64) (uint64, error) {
	var ownerUserID uint64
	err := r.db.QueryRowContext(ctx,
		`SELECT owner_user_id FROM projects WHERE id = ?`, projectID).Scan(&ownerUserID)
	if err == sql.ErrNoRows {
		return 0, fmt.Errorf("project not found")
	}
	if err != nil {
		return 0, err
	}
	return ownerUserID, nil
}

// ListProjectMembers returns members for a project with synthesized role tags.
func (r *Repository) ListProjectMembers(ctx context.Context, projectID uint64) ([]ProjectMember, error) {
	ownerUserID, err := r.ProjectOwnerUserID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	return r.listProjectMembers(ctx, projectID, ownerUserID)
}

func (r *Repository) listProjectMembers(ctx context.Context, projectID, ownerUserID uint64) ([]ProjectMember, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, project_id, user_id, invited_by,
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
		if err := rows.Scan(&item.ID, &item.ProjectID, &item.UserID, &item.InvitedBy, &item.JoinedAt); err != nil {
			return nil, err
		}
		item.RoleCodes = domain.SynthesizeRoleCodes(ownerUserID, item.UserID)
		item.RoleCode = domain.PrimaryRoleCode(item.RoleCodes)
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
		members, err := r.listProjectMembers(ctx, projects[i].ID, projects[i].OwnerUserID)
		if err != nil {
			return err
		}
		projects[i].Members = members
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT project_id,
		       SUM(CASE WHEN requirement_type = 'BUG' THEN 1 ELSE 0 END),
		       SUM(CASE WHEN requirement_type = 'REQUIREMENT' THEN 1 ELSE 0 END)
		FROM requirements
		WHERE current_status <> 'COMPLETED' AND project_id IN (`+placeholders(len(ids))+`)
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
		  COALESCE(SUM(CASE WHEN requirement_type = 'REQUIREMENT' THEN 1 ELSE 0 END), 0),
		  COALESCE(SUM(CASE WHEN requirement_type = 'BUG' THEN 1 ELSE 0 END), 0)
		FROM requirements
		WHERE project_id = ? AND current_status <> 'COMPLETED'`, projectID).
		Scan(&reqCount, &bugCount)
	if err != nil {
		return 0, 0, err
	}
	return reqCount, bugCount, nil
}

// CreateProjectInput holds fields for creating a project.
type CreateProjectInput struct {
	Name        string
	Description string
	OwnerUserID uint64
}

// CreateProject inserts a new project and owner membership. Returns the new project id.
func (r *Repository) CreateProject(ctx context.Context, input CreateProjectInput) (uint64, error) {
	if err := domain.ValidateProjectCreate(input.Name, input.Description, input.OwnerUserID); err != nil {
		return 0, err
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()

	result, err := tx.ExecContext(ctx, `
		INSERT INTO projects (name, description, owner_user_id)
		VALUES (?, ?, ?)`,
		strings.TrimSpace(input.Name), nullIfEmptyString(input.Description), input.OwnerUserID)
	if err != nil {
		return 0, err
	}
	insertedID, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO project_members (project_id, user_id, invited_by)
		VALUES (?, ?, ?)`,
		insertedID, input.OwnerUserID, input.OwnerUserID)
	if err != nil {
		return 0, err
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}

	return uint64(insertedID), nil
}

// GetProjectMemberRole returns the synthesized role_code for a user in a
// project, or empty if the user is not a member.
func (r *Repository) GetProjectMemberRole(ctx context.Context, projectID, userID uint64) (string, error) {
	ownerUserID, err := r.ProjectOwnerUserID(ctx, projectID)
	if err != nil {
		return "", err
	}
	var one int
	err = r.db.QueryRowContext(ctx, `
		SELECT 1 FROM project_members
		WHERE project_id = ? AND user_id = ? LIMIT 1`, projectID, userID).Scan(&one)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return domain.PrimaryRoleCode(domain.SynthesizeRoleCodes(ownerUserID, userID)), nil
}

// MemberCanManageProject reports whether the user can manage the project.
// Only projects.owner_user_id may manage members, repositories and settings.
func (r *Repository) MemberCanManageProject(ctx context.Context, projectID, userID uint64) (bool, error) {
	ownerUserID, err := r.ProjectOwnerUserID(ctx, projectID)
	if err != nil {
		return false, err
	}
	return domain.MemberCanManage(ownerUserID, userID), nil
}

// AddProjectMemberInput holds fields for adding a project member.
type AddProjectMemberInput struct {
	ProjectID uint64
	UserID    uint64
	InvitedBy uint64
}

// AddProjectMember inserts a membership row.
func (r *Repository) AddProjectMember(ctx context.Context, input AddProjectMemberInput) (ProjectMember, error) {
	ownerUserID, err := r.ProjectOwnerUserID(ctx, input.ProjectID)
	if err != nil {
		return ProjectMember{}, err
	}

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
		INSERT INTO project_members (project_id, user_id, invited_by)
		VALUES (?, ?, ?)`,
		input.ProjectID, input.UserID, input.InvitedBy)
	if err != nil {
		return ProjectMember{}, err
	}
	memberID, err := result.LastInsertId()
	if err != nil {
		return ProjectMember{}, err
	}

	var userName string
	err = tx.QueryRowContext(ctx, `SELECT name FROM users WHERE id = ?`, input.UserID).Scan(&userName)
	if err != nil {
		return ProjectMember{}, err
	}

	if err := tx.Commit(); err != nil {
		return ProjectMember{}, err
	}

	roleCodes := domain.SynthesizeRoleCodes(ownerUserID, input.UserID)
	return ProjectMember{
		ID:        uint64(memberID),
		ProjectID: input.ProjectID,
		UserID:    input.UserID,
		UserName:  userName,
		InvitedBy: input.InvitedBy,
		RoleCode:  domain.PrimaryRoleCode(roleCodes),
		RoleCodes: roleCodes,
	}, nil
}

// GetProjectMember returns a single membership row.
func (r *Repository) GetProjectMember(ctx context.Context, projectID, memberID uint64) (ProjectMember, error) {
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

// RemoveProjectMember deletes a membership. The project owner cannot be removed.
func (r *Repository) RemoveProjectMember(ctx context.Context, projectID, memberID uint64) error {
	ownerUserID, err := r.ProjectOwnerUserID(ctx, projectID)
	if err != nil {
		return err
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var userID uint64
	err = tx.QueryRowContext(ctx, `
		SELECT user_id FROM project_members
		WHERE id = ? AND project_id = ?`, memberID, projectID).Scan(&userID)
	if err == sql.ErrNoRows {
		return fmt.Errorf("member not found")
	}
	if err != nil {
		return err
	}

	if userID == ownerUserID {
		return fmt.Errorf("cannot remove the sole project manager")
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

// UpdateProjectSetupInput holds optional project fields.
type UpdateProjectSetupInput struct {
	Name           *string
	Description    *string
	WPSGroupID     *string
	WPSGroupName   *string
	WPSDocFolderID *string
}

// UpdateProjectSetup updates project basic info and optional WPS binding fields.
func (r *Repository) UpdateProjectSetup(ctx context.Context, projectID uint64, input UpdateProjectSetupInput) (ProjectDetail, error) {
	assignments := make([]string, 0, 5)
	args := make([]any, 0, 6)

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return ProjectDetail{}, fmt.Errorf("name is required")
		}
		assignments = append(assignments, "name = ?")
		args = append(args, name)
	}
	if input.Description != nil {
		assignments = append(assignments, "description = ?")
		args = append(args, nullIfEmptyString(*input.Description))
	}
	if input.WPSGroupID != nil {
		assignments = append(assignments, "wps_group_id = ?")
		args = append(args, nullIfEmptyString(*input.WPSGroupID))
	}
	if input.WPSGroupName != nil {
		assignments = append(assignments, "wps_group_name = ?")
		args = append(args, nullIfEmptyString(*input.WPSGroupName))
	}
	if input.WPSDocFolderID != nil {
		assignments = append(assignments, "wps_doc_folder_id = ?")
		args = append(args, nullIfEmptyString(*input.WPSDocFolderID))
	}

	if len(assignments) > 0 {
		args = append(args, projectID)
		_, err := r.db.ExecContext(ctx,
			`UPDATE projects SET `+strings.Join(assignments, ", ")+` WHERE id = ?`, args...)
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
