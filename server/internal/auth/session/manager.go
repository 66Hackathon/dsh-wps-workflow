package session

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sync"
	"time"
)

// User is the authenticated TeamSpace user exposed to clients.
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

// Record holds a system session (Bearer token).
type Record struct {
	ID        string
	User      User
	ExpiresAt time.Time
	CreatedAt time.Time
}

// SessionStore persists authenticated sessions.
type SessionStore interface {
	SaveSession(ctx context.Context, record *Record) error
	LoadSession(ctx context.Context, id string) (*Record, error)
	DeleteSession(ctx context.Context, id string) error
}

// RepositoryStore persists sessions in MySQL.
type RepositoryStore interface {
	SaveSession(ctx context.Context, row SessionRow) error
	GetSession(ctx context.Context, id string) (*SessionRow, error)
	DeleteSession(ctx context.Context, id string) error
	GetUserByID(ctx context.Context, userID uint64) (UserProfile, error)
}

// SessionRow mirrors the repository session row for decoupling.
type SessionRow struct {
	ID        string
	UserID    uint64
	ExpiresAt time.Time
}

// UserProfile is the DB user view attached to a session.
type UserProfile struct {
	ID             uint64
	WPSUserID      string
	Name           string
	NickName       string
	AvatarURL      string
	CompanyName    string
	OrganizationID uint64
	AccountState   string
}

// Manager stores OAuth state in memory and sessions through an optional store.
type Manager struct {
	mu       sync.RWMutex
	sessions map[string]*Record
	states   map[string]time.Time
	store    SessionStore
}

// NewManager returns a session manager with in-memory sessions only.
func NewManager() *Manager {
	return &Manager{
		sessions: make(map[string]*Record),
		states:   make(map[string]time.Time),
	}
}

// NewManagerWithStore returns a manager that persists sessions through store.
func NewManagerWithStore(store SessionStore) *Manager {
	m := NewManager()
	m.store = store
	return m
}

// CreateState mints a CSRF state value valid for ten minutes.
func (m *Manager) CreateState() (string, error) {
	state, err := randomToken(16)
	if err != nil {
		return "", err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.states[state] = time.Now().Add(10 * time.Minute)
	m.cleanupLocked(time.Now())
	return state, nil
}

// ConsumeState validates and removes a CSRF state value.
func (m *Manager) ConsumeState(state string) bool {
	if state == "" {
		return false
	}
	now := time.Now()
	m.mu.Lock()
	defer m.mu.Unlock()
	expiresAt, ok := m.states[state]
	if !ok || now.After(expiresAt) {
		delete(m.states, state)
		return false
	}
	delete(m.states, state)
	return true
}

// CreateSession stores a new system session and returns its token id.
func (m *Manager) CreateSession(user User, ttlSec int) (string, *Record, error) {
	id, err := randomToken(24)
	if err != nil {
		return "", nil, err
	}
	if ttlSec <= 0 {
		ttlSec = 7 * 24 * 3600
	}
	now := time.Now()
	record := &Record{
		ID:        id,
		User:      user,
		ExpiresAt: now.Add(time.Duration(ttlSec) * time.Second),
		CreatedAt: now,
	}
	if m.store != nil {
		if err := m.store.SaveSession(context.Background(), record); err != nil {
			return "", nil, err
		}
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sessions[id] = record
	return id, record, nil
}

// Get returns a session by id.
func (m *Manager) Get(id string) (*Record, bool) {
	if id == "" {
		return nil, false
	}
	m.mu.RLock()
	record, ok := m.sessions[id]
	m.mu.RUnlock()
	if ok {
		if !sessionStillValid(record) {
			m.Delete(id)
			return nil, false
		}
		return record, true
	}
	if m.store == nil {
		return nil, false
	}
	loaded, err := m.store.LoadSession(context.Background(), id)
	if err != nil {
		return nil, false
	}
	if !sessionStillValid(loaded) {
		m.Delete(id)
		return nil, false
	}
	m.mu.Lock()
	m.sessions[id] = loaded
	m.mu.Unlock()
	return loaded, true
}

func sessionStillValid(record *Record) bool {
	return record != nil && time.Now().Before(record.ExpiresAt)
}

// Delete removes a session.
func (m *Manager) Delete(id string) {
	if id == "" {
		return
	}
	if m.store != nil {
		_ = m.store.DeleteSession(context.Background(), id)
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, id)
}

func (m *Manager) cleanupLocked(now time.Time) {
	for state, expiresAt := range m.states {
		if now.After(expiresAt) {
			delete(m.states, state)
		}
	}
}

// RepoStore adapts a RepositoryStore to SessionStore.
type RepoStore struct {
	Repo RepositoryStore
}

// SaveSession persists a session record.
func (s *RepoStore) SaveSession(ctx context.Context, record *Record) error {
	return s.Repo.SaveSession(ctx, SessionRow{
		ID:        record.ID,
		UserID:    record.User.ID,
		ExpiresAt: record.ExpiresAt,
	})
}

// LoadSession loads a session and refreshes the embedded user profile from DB.
func (s *RepoStore) LoadSession(ctx context.Context, id string) (*Record, error) {
	row, err := s.Repo.GetSession(ctx, id)
	if err != nil {
		return nil, err
	}
	profile, err := s.Repo.GetUserByID(ctx, row.UserID)
	if err != nil {
		return nil, err
	}
	return &Record{
		ID:        row.ID,
		User:      userFromProfile(profile),
		ExpiresAt: row.ExpiresAt,
		CreatedAt: time.Now(),
	}, nil
}

// DeleteSession removes a persisted session.
func (s *RepoStore) DeleteSession(ctx context.Context, id string) error {
	return s.Repo.DeleteSession(ctx, id)
}

func userFromProfile(profile UserProfile) User {
	return User{
		ID:             profile.ID,
		WPSUserID:      profile.WPSUserID,
		Name:           profile.Name,
		NickName:       profile.NickName,
		AvatarURL:      profile.AvatarURL,
		CompanyName:    profile.CompanyName,
		OrganizationID: profile.OrganizationID,
		AccountState:   profile.AccountState,
	}
}

func randomToken(bytes int) (string, error) {
	buf := make([]byte, bytes)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("random token: %w", err)
	}
	return hex.EncodeToString(buf), nil
}
