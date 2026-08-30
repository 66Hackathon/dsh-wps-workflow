package sessionstore

import (
	"context"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/auth/session"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/repository"
)

// MySQL adapts repository.Repository to session.RepositoryStore.
type MySQL struct {
	Repo *repository.Repository
}

// SaveSession persists a session row.
func (m MySQL) SaveSession(ctx context.Context, row session.SessionRow) error {
	return m.Repo.SaveSession(ctx, repository.SessionRow{
		ID:        row.ID,
		UserID:    row.UserID,
		ExpiresAt: row.ExpiresAt,
	})
}

// GetSession loads a session row.
func (m MySQL) GetSession(ctx context.Context, id string) (*session.SessionRow, error) {
	row, err := m.Repo.GetSession(ctx, id)
	if err != nil {
		return nil, err
	}
	return &session.SessionRow{
		ID:        row.ID,
		UserID:    row.UserID,
		ExpiresAt: row.ExpiresAt,
	}, nil
}

// DeleteSession removes a session row.
func (m MySQL) DeleteSession(ctx context.Context, id string) error {
	return m.Repo.DeleteSession(ctx, id)
}

// GetUserByID loads the current user profile for a session.
func (m MySQL) GetUserByID(ctx context.Context, userID uint64) (session.UserProfile, error) {
	user, err := m.Repo.GetUserByID(ctx, userID)
	if err != nil {
		return session.UserProfile{}, err
	}
	return session.UserProfile{
		ID:             user.ID,
		WPSUserID:      user.WPSUserID,
		Name:           user.Name,
		NickName:       user.NickName,
		AvatarURL:      user.AvatarURL,
		CompanyName:    user.CompanyName,
		OrganizationID: user.OrganizationID,
		AccountState:   user.AccountState,
	}, nil
}
