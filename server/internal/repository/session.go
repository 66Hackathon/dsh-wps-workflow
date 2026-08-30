package repository

import (
	"context"
	"database/sql"
	"time"
)

// SessionRow is a persisted system session (Bearer token).
type SessionRow struct {
	ID        string
	UserID    uint64
	ExpiresAt time.Time
}

// SaveSession upserts a system session row.
func (r *Repository) SaveSession(ctx context.Context, row SessionRow) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO user_sessions (id, user_id, expires_at)
		VALUES (?, ?, ?)
		ON DUPLICATE KEY UPDATE
			user_id = VALUES(user_id),
			expires_at = VALUES(expires_at),
			updated_at = CURRENT_TIMESTAMP(3)`,
		row.ID, row.UserID, row.ExpiresAt.UTC())
	return err
}

// GetSession loads a session by id. Expired sessions are deleted.
func (r *Repository) GetSession(ctx context.Context, id string) (*SessionRow, error) {
	if id == "" {
		return nil, sql.ErrNoRows
	}
	var row SessionRow
	err := r.db.QueryRowContext(ctx, `
		SELECT id, user_id, expires_at
		FROM user_sessions WHERE id = ? LIMIT 1`, id).
		Scan(&row.ID, &row.UserID, &row.ExpiresAt)
	if err != nil {
		return nil, err
	}
	if time.Now().UTC().After(row.ExpiresAt) {
		_ = r.DeleteSession(ctx, id)
		return nil, sql.ErrNoRows
	}
	return &row, nil
}

// DeleteSession removes a session row.
func (r *Repository) DeleteSession(ctx context.Context, id string) error {
	if id == "" {
		return nil
	}
	_, err := r.db.ExecContext(ctx, `DELETE FROM user_sessions WHERE id = ?`, id)
	return err
}
