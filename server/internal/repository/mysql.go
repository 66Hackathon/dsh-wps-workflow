package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/auth/wps"
	_ "github.com/go-sql-driver/mysql"
)

// User is a TeamSpace user row exposed to clients.
type User struct {
	ID             uint64 `json:"id"`
	WPSUserID      string `json:"wps_user_id"`
	Name           string `json:"name"`
	NickName       string `json:"nick_name,omitempty"`
	AvatarURL      string `json:"avatar_url,omitempty"`
	CompanyName    string `json:"company_name,omitempty"`
	OrganizationID uint64 `json:"organization_id"`
	AccountState   string `json:"account_state"`
}

// Project is a minimal project row for list responses.
type Project struct {
	ID                 uint64 `json:"id"`
	ProjectCode        string `json:"project_code"`
	Name               string `json:"name"`
	Description        string `json:"description,omitempty"`
	Status             string `json:"status"`
	GitRepoURL         string `json:"git_repo_url,omitempty"`
	GitDefaultBranch   string `json:"git_default_branch,omitempty"`
	WPSGroupID         string `json:"wps_group_id,omitempty"`
	WPSGroupName       string `json:"wps_group_name,omitempty"`
	CreatedBy          uint64 `json:"created_by,omitempty"`
	CreatedAt          string `json:"created_at,omitempty"`
	UpdatedAt          string `json:"updated_at,omitempty"`
	RequirementCount   int    `json:"requirement_count"`
	BugCount           int    `json:"bug_count"`
}

// Repository wraps MySQL access for TeamSpace.
type Repository struct {
	db *sql.DB
}

// NewMySQL opens a MySQL connection pool.
func NewMySQL(dsn string) (*Repository, error) {
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping mysql: %w", err)
	}
	return &Repository{db: db}, nil
}

// Close releases the connection pool.
func (r *Repository) Close() error {
	if r.db == nil {
		return nil
	}
	return r.db.Close()
}

func (r *Repository) UpsertWPSUser(ctx context.Context, profile *wps.UserInfo, token *wps.TokenResponse) (User, error) {
	if profile == nil || profile.ID == "" {
		return User{}, fmt.Errorf("wps profile is required")
	}
	if token == nil || token.AccessToken == "" {
		return User{}, fmt.Errorf("wps token is required")
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return User{}, err
	}
	defer func() { _ = tx.Rollback() }()

	orgID, companyName, err := ensureOrganization(ctx, tx, profile.CompanyID)
	if err != nil {
		return User{}, err
	}

	displayName := profile.DisplayName()
	nickName := strings.TrimSpace(profile.NickName)
	avatarURL := strings.TrimSpace(profile.Avatar)
	now := time.Now().UTC()
	expiresAt := now.Add(time.Duration(tokenExpiresIn(token)) * time.Second)
	var refreshExpires any
	if token.RefreshExpiresIn > 0 {
		refreshExpires = now.Add(time.Duration(token.RefreshExpiresIn) * time.Second)
	}

	var userID uint64
	err = tx.QueryRowContext(ctx, `SELECT id FROM users WHERE wps_user_id = ? LIMIT 1`, profile.ID).Scan(&userID)
	if err != nil && err != sql.ErrNoRows {
		return User{}, err
	}

	if err == sql.ErrNoRows {
		result, insertErr := tx.ExecContext(ctx, `
			INSERT INTO users (
				organization_id, wps_user_id, name, nick_name, avatar_url, company_name,
				wps_access_token, wps_refresh_token, wps_token_expires_at, wps_refresh_expires_at,
				account_state, first_login_at, last_login_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
			orgID, profile.ID, displayName, nullIfEmpty(nickName), nullIfEmpty(avatarURL), nullIfEmpty(companyName),
			token.AccessToken, nullIfEmpty(token.RefreshToken), expiresAt, refreshExpires,
			now, now)
		if insertErr != nil {
			return User{}, insertErr
		}
		insertedID, insertErr := result.LastInsertId()
		if insertErr != nil {
			return User{}, insertErr
		}
		userID = uint64(insertedID)
	} else {
		_, err = tx.ExecContext(ctx, `
			UPDATE users SET
				organization_id = ?, name = ?, nick_name = ?, avatar_url = ?, company_name = ?,
				wps_access_token = ?, wps_refresh_token = ?,
				wps_token_expires_at = ?, wps_refresh_expires_at = ?,
				account_state = 'ACTIVE', last_login_at = ?
			WHERE id = ?`,
			orgID, displayName, nullIfEmpty(nickName), nullIfEmpty(avatarURL), nullIfEmpty(companyName),
			token.AccessToken, nullIfEmpty(token.RefreshToken), expiresAt, refreshExpires,
			now, userID)
		if err != nil {
			return User{}, err
		}
	}

	if err := tx.Commit(); err != nil {
		return User{}, err
	}
	return r.GetUserByID(ctx, userID)
}

func tokenExpiresIn(token *wps.TokenResponse) int {
	if token.ExpiresIn > 0 {
		return token.ExpiresIn
	}
	return 7200
}

func ensureOrganization(ctx context.Context, tx *sql.Tx, tenantID string) (uint64, string, error) {
	if tenantID == "" {
		tenantID = "default-tenant"
	}
	var orgID uint64
	var orgName string
	err := tx.QueryRowContext(ctx, `
		SELECT id, name FROM organizations WHERE wps_tenant_id = ? LIMIT 1`, tenantID).
		Scan(&orgID, &orgName)
	if err == nil {
		return orgID, orgName, nil
	}
	if err != sql.ErrNoRows {
		return 0, "", err
	}
	orgName = "WPS 企业 " + tenantID
	result, err := tx.ExecContext(ctx, `
		INSERT INTO organizations (name, wps_tenant_id, status)
		VALUES (?, ?, 'ACTIVE')`, orgName, tenantID)
	if err != nil {
		return 0, "", err
	}
	insertedID, err := result.LastInsertId()
	if err != nil {
		return 0, "", err
	}
	return uint64(insertedID), orgName, nil
}

func nullIfEmpty(value string) any {
	if value == "" {
		return nil
	}
	return value
}

// ListProjects returns active projects ordered by id desc.
func (r *Repository) ListProjects(ctx context.Context) ([]ProjectDetail, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, project_code, name, IFNULL(description, ''), status, owner_user_id,
		       IFNULL(git_repo_url, ''), IFNULL(git_default_branch, ''),
		       IFNULL(wps_group_id, ''), IFNULL(wps_group_name, ''),
		       created_by,
		       DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ'),
		       DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%sZ')
		FROM projects
		WHERE status = 'ACTIVE'
		ORDER BY id DESC
		LIMIT 100`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := make([]ProjectDetail, 0)
	ids := make([]uint64, 0)
	for rows.Next() {
		var item ProjectDetail
		if err := rows.Scan(
			&item.ID, &item.ProjectCode, &item.Name, &item.Description, &item.Status, &item.OwnerUserID,
			&item.GitRepoURL, &item.GitDefaultBranch, &item.WPSGroupID, &item.WPSGroupName,
			&item.CreatedBy, &item.CreatedAt, &item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		projects = append(projects, item)
		ids = append(ids, item.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := r.attachProjectListExtras(ctx, projects, ids); err != nil {
		return nil, err
	}
	return projects, nil
}
