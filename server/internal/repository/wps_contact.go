package repository

import (
	"context"
	"database/sql"
	"strings"
)

// WPSContactInput holds minimal WPS contact data for local user provisioning.
type WPSContactInput struct {
	WPSUserID string
	Name      string
	NickName  string
	Email     string
	AvatarURL string
}

// EnsureUsersFromWPSContacts creates or updates lightweight local users from WPS contacts.
func (r *Repository) EnsureUsersFromWPSContacts(ctx context.Context, contacts []WPSContactInput) ([]OrgUser, error) {
	if len(contacts) == 0 {
		return []OrgUser{}, nil
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	items := make([]OrgUser, 0, len(contacts))

	for _, contact := range contacts {
		wpsUserID := strings.TrimSpace(contact.WPSUserID)
		if wpsUserID == "" {
			continue
		}
		displayName := strings.TrimSpace(contact.Name)
		if displayName == "" {
			displayName = strings.TrimSpace(contact.NickName)
		}
		if displayName == "" {
			displayName = wpsUserID
		}

		var userID uint64
		err := tx.QueryRowContext(ctx, `SELECT id FROM users WHERE wps_user_id = ? LIMIT 1`, wpsUserID).Scan(&userID)
		if err != nil && err != sql.ErrNoRows {
			return nil, err
		}

		if err == sql.ErrNoRows {
			result, insertErr := tx.ExecContext(ctx, `
				INSERT INTO users (
					wps_user_id, name, avatar_url, email, account_state
				) VALUES (?, ?, ?, ?, 'ACTIVE')`,
				wpsUserID, displayName,
				nullIfEmpty(strings.TrimSpace(contact.AvatarURL)),
				nullIfEmpty(strings.TrimSpace(contact.Email)))
			if insertErr != nil {
				return nil, insertErr
			}
			insertedID, insertErr := result.LastInsertId()
			if insertErr != nil {
				return nil, insertErr
			}
			userID = uint64(insertedID)
		} else {
			_, updateErr := tx.ExecContext(ctx, `
				UPDATE users SET
					name = ?,
					avatar_url = COALESCE(NULLIF(?, ''), avatar_url),
					email = COALESCE(NULLIF(?, ''), email),
					account_state = 'ACTIVE'
				WHERE id = ?`,
				displayName,
				strings.TrimSpace(contact.AvatarURL),
				strings.TrimSpace(contact.Email),
				userID)
			if updateErr != nil {
				return nil, updateErr
			}
		}

		var item OrgUser
		err = tx.QueryRowContext(ctx, `
			SELECT id, name, IFNULL(email, '')
			FROM users WHERE id = ? LIMIT 1`, userID).
			Scan(&item.ID, &item.Name, &item.Email)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return items, nil
}

// ListProjectMemberWPSUserIDs returns WPS user ids for project members.
func (r *Repository) ListProjectMemberWPSUserIDs(ctx context.Context, projectID uint64) ([]string, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT u.wps_user_id
		FROM project_members pm
		JOIN users u ON u.id = pm.user_id
		WHERE pm.project_id = ? AND u.wps_user_id <> ''
		ORDER BY pm.id`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := make([]string, 0)
	for rows.Next() {
		var wpsUserID string
		if err := rows.Scan(&wpsUserID); err != nil {
			return nil, err
		}
		ids = append(ids, wpsUserID)
	}
	return ids, rows.Err()
}
