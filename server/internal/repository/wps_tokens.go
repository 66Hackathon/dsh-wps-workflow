package repository

import (
	"context"
	"database/sql"
	"time"
)

// WPSTokens holds OAuth tokens persisted on the user row.
type WPSTokens struct {
	AccessToken      string
	RefreshToken     string
	ExpiresAt        time.Time
	RefreshExpiresAt time.Time
}

// UpdateUserWPSTokens persists renewed WPS OAuth tokens for a user.
func (r *Repository) UpdateUserWPSTokens(ctx context.Context, userID uint64, tokens WPSTokens) error {
	var refreshExpires any
	if !tokens.RefreshExpiresAt.IsZero() {
		refreshExpires = tokens.RefreshExpiresAt.UTC()
	}
	_, err := r.db.ExecContext(ctx, `
		UPDATE users SET
			wps_access_token = ?,
			wps_refresh_token = ?,
			wps_token_expires_at = ?,
			wps_refresh_expires_at = ?,
			updated_at = CURRENT_TIMESTAMP(3)
		WHERE id = ?`,
		nullIfEmpty(tokens.AccessToken),
		nullIfEmpty(tokens.RefreshToken),
		tokens.ExpiresAt.UTC(),
		refreshExpires,
		userID,
	)
	return err
}

// GetUserWPSTokens loads WPS OAuth tokens from the user row.
func (r *Repository) GetUserWPSTokens(ctx context.Context, userID uint64) (WPSTokens, error) {
	var tokens WPSTokens
	var access, refresh sql.NullString
	var expires, refreshExpires sql.NullTime
	err := r.db.QueryRowContext(ctx, `
		SELECT wps_access_token, wps_refresh_token, wps_token_expires_at, wps_refresh_expires_at
		FROM users WHERE id = ?`, userID).
		Scan(&access, &refresh, &expires, &refreshExpires)
	if err != nil {
		return WPSTokens{}, err
	}
	if access.Valid {
		tokens.AccessToken = access.String
	}
	if refresh.Valid {
		tokens.RefreshToken = refresh.String
	}
	if expires.Valid {
		tokens.ExpiresAt = expires.Time
	}
	if refreshExpires.Valid {
		tokens.RefreshExpiresAt = refreshExpires.Time
	}
	return tokens, nil
}
