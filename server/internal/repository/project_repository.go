package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/domain"
)

// ProjectRepository is a code repo linked to a project with a dev direction.
type ProjectRepository struct {
	ID                uint64 `json:"id"`
	ProjectID         uint64 `json:"project_id"`
	RepoName          string `json:"repo_name,omitempty"`
	RepoURL           string `json:"repo_url"`
	DefaultBranch     string `json:"default_branch"`
	DevDirection      string `json:"dev_direction"`
	DevDirectionLabel string `json:"dev_direction_label,omitempty"`
	SortOrder         uint32 `json:"sort_order"`
	CreatedAt         string `json:"created_at,omitempty"`
	UpdatedAt         string `json:"updated_at,omitempty"`
}

// CreateProjectRepositoryInput holds fields for adding a repo.
type CreateProjectRepositoryInput struct {
	ProjectID     uint64
	RepoName      string
	RepoURL       string
	DefaultBranch string
	DevDirection  string
	SortOrder     uint32
}

// UpdateProjectRepositoryInput holds optional fields for updating a repo.
type UpdateProjectRepositoryInput struct {
	RepoName      *string
	RepoURL       *string
	DefaultBranch *string
	DevDirection  *string
	SortOrder     *uint32
}

const projectRepositorySelectColumns = `
	id, project_id, IFNULL(repo_name, ''), repo_url, default_branch, dev_direction, sort_order,
	DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ'),
	DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%sZ')
`

func scanProjectRepository(row scanner) (ProjectRepository, error) {
	var item ProjectRepository
	err := row.Scan(
		&item.ID, &item.ProjectID, &item.RepoName, &item.RepoURL,
		&item.DefaultBranch, &item.DevDirection, &item.SortOrder,
		&item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		return ProjectRepository{}, err
	}
	item.DevDirectionLabel = domain.DevDirectionLabels[item.DevDirection]
	return item, nil
}

// ListProjectRepositories returns repos for a project ordered by sort_order, id.
func (r *Repository) ListProjectRepositories(ctx context.Context, projectID uint64) ([]ProjectRepository, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT `+projectRepositorySelectColumns+`
		FROM project_repositories
		WHERE project_id = ?
		ORDER BY sort_order ASC, id ASC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]ProjectRepository, 0)
	for rows.Next() {
		item, err := scanProjectRepository(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// GetProjectRepository returns a repo by id scoped to project.
func (r *Repository) GetProjectRepository(ctx context.Context, projectID, repoID uint64) (ProjectRepository, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT `+projectRepositorySelectColumns+`
		FROM project_repositories
		WHERE project_id = ? AND id = ?`, projectID, repoID)
	item, err := scanProjectRepository(row)
	if err != nil {
		if err == sql.ErrNoRows {
			return ProjectRepository{}, fmt.Errorf("repository not found")
		}
		return ProjectRepository{}, err
	}
	return item, nil
}

// CreateProjectRepository inserts a new repo row.
func (r *Repository) CreateProjectRepository(ctx context.Context, input CreateProjectRepositoryInput) (ProjectRepository, error) {
	repoURL := strings.TrimSpace(input.RepoURL)
	branch := strings.TrimSpace(input.DefaultBranch)
	if branch == "" {
		branch = "main"
	}
	direction := strings.ToUpper(strings.TrimSpace(input.DevDirection))
	if err := domain.ValidateProjectRepositoryInput(repoURL, branch, direction); err != nil {
		return ProjectRepository{}, err
	}

	result, err := r.db.ExecContext(ctx, `
		INSERT INTO project_repositories (
			project_id, repo_name, repo_url, default_branch, dev_direction, sort_order
		) VALUES (?, ?, ?, ?, ?, ?)`,
		input.ProjectID, strings.TrimSpace(input.RepoName), repoURL, branch, direction, input.SortOrder)
	if err != nil {
		return ProjectRepository{}, err
	}
	insertedID, err := result.LastInsertId()
	if err != nil {
		return ProjectRepository{}, err
	}
	return r.GetProjectRepository(ctx, input.ProjectID, uint64(insertedID))
}

// UpdateProjectRepository updates an existing repo row.
func (r *Repository) UpdateProjectRepository(
	ctx context.Context,
	projectID, repoID uint64,
	input UpdateProjectRepositoryInput,
) (ProjectRepository, error) {
	current, err := r.GetProjectRepository(ctx, projectID, repoID)
	if err != nil {
		return ProjectRepository{}, err
	}

	repoName := current.RepoName
	repoURL := current.RepoURL
	branch := current.DefaultBranch
	direction := current.DevDirection
	sortOrder := current.SortOrder

	if input.RepoName != nil {
		repoName = strings.TrimSpace(*input.RepoName)
	}
	if input.RepoURL != nil {
		repoURL = strings.TrimSpace(*input.RepoURL)
	}
	if input.DefaultBranch != nil {
		branch = strings.TrimSpace(*input.DefaultBranch)
	}
	if input.DevDirection != nil {
		direction = strings.ToUpper(strings.TrimSpace(*input.DevDirection))
	}
	if input.SortOrder != nil {
		sortOrder = *input.SortOrder
	}

	if err := domain.ValidateProjectRepositoryInput(repoURL, branch, direction); err != nil {
		return ProjectRepository{}, err
	}

	_, err = r.db.ExecContext(ctx, `
		UPDATE project_repositories
		SET repo_name = ?, repo_url = ?, default_branch = ?, dev_direction = ?, sort_order = ?
		WHERE project_id = ? AND id = ?`,
		repoName, repoURL, branch, direction, sortOrder, projectID, repoID)
	if err != nil {
		return ProjectRepository{}, err
	}
	return r.GetProjectRepository(ctx, projectID, repoID)
}

// DeleteProjectRepository removes a repo row.
func (r *Repository) DeleteProjectRepository(ctx context.Context, projectID, repoID uint64) error {
	result, err := r.db.ExecContext(ctx, `
		DELETE FROM project_repositories WHERE project_id = ? AND id = ?`, projectID, repoID)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return fmt.Errorf("repository not found")
	}
	return nil
}

// ReplaceProjectRepositories replaces all repos for a project in one transaction.
func (r *Repository) ReplaceProjectRepositories(
	ctx context.Context,
	projectID uint64,
	items []CreateProjectRepositoryInput,
) ([]ProjectRepository, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `DELETE FROM project_repositories WHERE project_id = ?`, projectID); err != nil {
		return nil, err
	}

	for i, item := range items {
		item.ProjectID = projectID
		if item.SortOrder == 0 {
			item.SortOrder = uint32(i + 1)
		}
		repoURL := strings.TrimSpace(item.RepoURL)
		branch := strings.TrimSpace(item.DefaultBranch)
		if branch == "" {
			branch = "main"
		}
		direction := strings.ToUpper(strings.TrimSpace(item.DevDirection))
		if err := domain.ValidateProjectRepositoryInput(repoURL, branch, direction); err != nil {
			return nil, err
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO project_repositories (
				project_id, repo_name, repo_url, default_branch, dev_direction, sort_order
			) VALUES (?, ?, ?, ?, ?, ?)`,
			projectID, strings.TrimSpace(item.RepoName), repoURL, branch, direction, item.SortOrder); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return r.ListProjectRepositories(ctx, projectID)
}

func (r *Repository) attachProjectRepositories(ctx context.Context, detail *ProjectDetail) error {
	repos, err := r.ListProjectRepositories(ctx, detail.ID)
	if err != nil {
		return err
	}
	detail.Repositories = repos
	return nil
}
