package repository

import (
	"context"
	"fmt"
	"strings"
)

// mapUserDisplayNames loads display names for the given user ids (single-table query).
func (r *Repository) mapUserDisplayNames(ctx context.Context, userIDs []uint64) (map[uint64]string, error) {
	out := make(map[uint64]string, len(userIDs))
	if len(userIDs) == 0 {
		return out, nil
	}

	unique := make([]uint64, 0, len(userIDs))
	seen := make(map[uint64]struct{}, len(userIDs))
	for _, id := range userIDs {
		if id == 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		unique = append(unique, id)
	}
	if len(unique) == 0 {
		return out, nil
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT id, COALESCE(NULLIF(nick_name, ''), name, '')
		FROM users
		WHERE id IN (`+strings.Repeat("?,", len(unique)-1)+`?)`,
		uint64Args(unique)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var id uint64
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		out[id] = name
	}
	return out, rows.Err()
}

const userSelectColumns = `
	id, wps_user_id, name, IFNULL(nick_name, ''), IFNULL(avatar_url, ''), IFNULL(company_name, ''), organization_id, account_state
`

func scanUser(row scanner) (User, error) {
	var user User
	err := row.Scan(
		&user.ID, &user.WPSUserID, &user.Name, &user.NickName, &user.AvatarURL, &user.CompanyName,
		&user.OrganizationID, &user.AccountState,
	)
	if err != nil {
		return User{}, err
	}
	return user, nil
}

type scanner interface {
	Scan(dest ...any) error
}

// GetUserByID returns a user row.
func (r *Repository) GetUserByID(ctx context.Context, userID uint64) (User, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT `+userSelectColumns+` FROM users WHERE id = ? LIMIT 1`, userID)
	return scanUser(row)
}

// GetUserByWPSID returns a user by WPS user id.
func (r *Repository) GetUserByWPSID(ctx context.Context, wpsUserID string) (User, error) {
	if wpsUserID == "" {
		return User{}, fmt.Errorf("wps user id is required")
	}
	row := r.db.QueryRowContext(ctx, `
		SELECT `+userSelectColumns+` FROM users WHERE wps_user_id = ? LIMIT 1`, wpsUserID)
	return scanUser(row)
}

// OrgUser is a lightweight user row for member pickers.
type OrgUser struct {
	ID       uint64 `json:"id"`
	Name     string `json:"name"`
	NickName string `json:"nick_name,omitempty"`
	Email    string `json:"email,omitempty"`
}

// ListAllUsers returns all active system users (for member pickers).
func (r *Repository) ListAllUsers(ctx context.Context) ([]OrgUser, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, name, IFNULL(nick_name, ''), IFNULL(email, '')
		FROM users
		WHERE account_state = 'ACTIVE'
		ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]OrgUser, 0)
	for rows.Next() {
		var item OrgUser
		if err := rows.Scan(&item.ID, &item.Name, &item.NickName, &item.Email); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// ListOrganizationUsers returns active users in an organization.
func (r *Repository) ListOrganizationUsers(ctx context.Context, organizationID uint64) ([]OrgUser, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, name, IFNULL(nick_name, ''), IFNULL(email, '')
		FROM users
		WHERE organization_id = ? AND account_state = 'ACTIVE'
		ORDER BY id`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]OrgUser, 0)
	for rows.Next() {
		var item OrgUser
		if err := rows.Scan(&item.ID, &item.Name, &item.NickName, &item.Email); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
