package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/domain"
)

// ProjectRepository is a code repo linked to a project. At most one row per
// (project_id, repository_type).
type ProjectRepository struct {
	ID                  uint64 `json:"id"`
	ProjectID           uint64 `json:"project_id"`
	RepositoryType      string `json:"repository_type"`
	RepositoryTypeLabel string `json:"repository_type_label,omitempty"`
	RepositoryURL       string `json:"repository_url"`
	NormalizedURL       string `json:"normalized_url,omitempty"`
	DefaultBranch       string `json:"default_branch"`
	ConfiguredBy        uint64 `json:"configured_by,omitempty"`
	CreatedAt           string `json:"created_at,omitempty"`
	UpdatedAt           string `json:"updated_at,omitempty"`

	// Legacy aliases kept so existing clients keep working.
	RepoURL           string `json:"repo_url"`
	DevDirection      string `json:"dev_direction"`
	DevDirectionLabel string `json:"dev_direction_label,omitempty"`
}

// CreateProjectRepositoryInput holds fields for configuring a repo.
type CreateProjectRepositoryInput struct {
	ProjectID      uint64
	RepositoryType string
	RepositoryURL  string
	DefaultBranch  string
	ConfiguredBy   uint64
}

// UpdateProjectRepositoryInput holds optional fields for updating a repo.
type UpdateProjectRepositoryInput struct {
	RepositoryType *string
	RepositoryURL  *string
	DefaultBranch  *string
	ConfiguredBy   uint64
}

const projectRepositorySelectColumns = `
	id, project_id, repository_type, repository_url, normalized_url,
	default_branch, configured_by,
	DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ'),
	DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%sZ')
`

func scanProjectRepository(row scanner) (ProjectRepository, error) {
	var item ProjectRepository
	err := row.Scan(
		&item.ID, &item.ProjectID, &item.RepositoryType, &item.RepositoryURL, &item.NormalizedURL,
		&item.DefaultBranch, &item.ConfiguredBy,
		&item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		return ProjectRepository{}, err
	}
	item.RepositoryTypeLabel = domain.DevDirectionLabels[item.RepositoryType]
	item.RepoURL = item.RepositoryURL
	item.DevDirection = item.RepositoryType
	item.DevDirectionLabel = item.RepositoryTypeLabel
	return item, nil
}

// normalizeRepositoryInput validates and canonicalizes repo fields.
func normalizeRepositoryInput(repositoryURL, defaultBranch, repositoryType string) (string, string, string, error) {
	url := strings.TrimSpace(repositoryURL)
	branch := strings.TrimSpace(defaultBranch)
	if branch == "" {
		branch = "main"
	}
	repoType := strings.ToUpper(strings.TrimSpace(repositoryType))
	if err := domain.ValidateProjectRepositoryInput(url, branch, repoType); err != nil {
		return "", "", "", err
	}
	return url, branch, repoType, nil
}

// ListProjectRepositories returns repos for a project ordered by type then id.
func (r *Repository) ListProjectRepositories(ctx context.Context, projectID uint64) ([]ProjectRepository, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT `+projectRepositorySelectColumns+`
		FROM project_repositories
		WHERE project_id = ?
		ORDER BY FIELD(repository_type, 'FRONTEND', 'BACKEND', 'MOBILE'), id ASC`, projectID)
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

// GetProjectRepositoryByType returns the repo configured for a repository type.
func (r *Repository) GetProjectRepositoryByType(ctx context.Context, projectID uint64, repositoryType string) (ProjectRepository, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT `+projectRepositorySelectColumns+`
		FROM project_repositories
		WHERE project_id = ? AND repository_type = ?`,
		projectID, strings.ToUpper(strings.TrimSpace(repositoryType)))
	item, err := scanProjectRepository(row)
	if err != nil {
		if err == sql.ErrNoRows {
			return ProjectRepository{}, fmt.Errorf("repository not found")
		}
		return ProjectRepository{}, err
	}
	return item, nil
}

// CreateProjectRepository configures the repo for a repository type. Because
// project_repositories allows at most one row per type, re-posting the same
// type updates the existing row instead of failing.
func (r *Repository) CreateProjectRepository(ctx context.Context, input CreateProjectRepositoryInput) (ProjectRepository, error) {
	url, branch, repoType, err := normalizeRepositoryInput(input.RepositoryURL, input.DefaultBranch, input.RepositoryType)
	if err != nil {
		return ProjectRepository{}, err
	}

	_, err = r.db.ExecContext(ctx, `
		INSERT INTO project_repositories (
			project_id, repository_type, repository_url, normalized_url, default_branch, configured_by
		) VALUES (?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			repository_url = VALUES(repository_url),
			normalized_url = VALUES(normalized_url),
			default_branch = VALUES(default_branch),
			configured_by  = VALUES(configured_by),
			updated_at     = CURRENT_TIMESTAMP(3)`,
		input.ProjectID, repoType, url, domain.NormalizeGitURL(url), branch, input.ConfiguredBy)
	if err != nil {
		return ProjectRepository{}, err
	}
	return r.GetProjectRepositoryByType(ctx, input.ProjectID, repoType)
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

	repositoryURL := current.RepositoryURL
	branch := current.DefaultBranch
	repoType := current.RepositoryType
	configuredBy := current.ConfiguredBy

	if input.RepositoryURL != nil {
		repositoryURL = *input.RepositoryURL
	}
	if input.DefaultBranch != nil {
		branch = *input.DefaultBranch
	}
	if input.RepositoryType != nil {
		repoType = *input.RepositoryType
	}
	if input.ConfiguredBy > 0 {
		configuredBy = input.ConfiguredBy
	}

	repositoryURL, branch, repoType, err = normalizeRepositoryInput(repositoryURL, branch, repoType)
	if err != nil {
		return ProjectRepository{}, err
	}

	_, err = r.db.ExecContext(ctx, `
		UPDATE project_repositories
		SET repository_type = ?, repository_url = ?, normalized_url = ?,
		    default_branch = ?, configured_by = ?
		WHERE project_id = ? AND id = ?`,
		repoType, repositoryURL, domain.NormalizeGitURL(repositoryURL), branch, configuredBy,
		projectID, repoID)
	if err != nil {
		return ProjectRepository{}, wrapDuplicateRepositoryType(err, repoType)
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
	seen := make(map[string]struct{}, len(items))
	normalized := make([]CreateProjectRepositoryInput, 0, len(items))
	for _, item := range items {
		url, branch, repoType, err := normalizeRepositoryInput(item.RepositoryURL, item.DefaultBranch, item.RepositoryType)
		if err != nil {
			return nil, err
		}
		if _, duplicate := seen[repoType]; duplicate {
			return nil, fmt.Errorf("duplicate repository_type: %s", repoType)
		}
		seen[repoType] = struct{}{}
		normalized = append(normalized, CreateProjectRepositoryInput{
			ProjectID:      projectID,
			RepositoryType: repoType,
			RepositoryURL:  url,
			DefaultBranch:  branch,
			ConfiguredBy:   item.ConfiguredBy,
		})
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `DELETE FROM project_repositories WHERE project_id = ?`, projectID); err != nil {
		return nil, err
	}

	for _, item := range normalized {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO project_repositories (
				project_id, repository_type, repository_url, normalized_url, default_branch, configured_by
			) VALUES (?, ?, ?, ?, ?, ?)`,
			projectID, item.RepositoryType, item.RepositoryURL,
			domain.NormalizeGitURL(item.RepositoryURL), item.DefaultBranch, item.ConfiguredBy); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return r.ListProjectRepositories(ctx, projectID)
}

func wrapDuplicateRepositoryType(err error, repositoryType string) error {
	if err == nil {
		return nil
	}
	if strings.Contains(err.Error(), "uk_project_repositories_project_type") {
		return fmt.Errorf("repository_type %s is already configured for this project", repositoryType)
	}
	return err
}

func (r *Repository) attachProjectRepositories(ctx context.Context, detail *ProjectDetail) error {
	repos, err := r.ListProjectRepositories(ctx, detail.ID)
	if err != nil {
		return err
	}
	detail.Repositories = repos
	return nil
}
