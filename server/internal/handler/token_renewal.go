package handler

import (
	"context"
	"time"

	"go.uber.org/zap"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/auth/session"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/repository"
)

func (h *AuthHandler) ensureFreshWPSTokens(ctx context.Context, userID uint64) {
	tokens, err := h.deps.Repo.GetUserWPSTokens(ctx, userID)
	if err != nil || tokens.RefreshToken == "" {
		return
	}
	if !needsWPSTokenRefresh(tokens, h.deps.Config.RefreshLeadDuration()) {
		return
	}

	renewCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	token, err := h.deps.WPS.RefreshAccessToken(renewCtx, tokens.RefreshToken)
	if err != nil {
		h.log().Warn("wps token refresh failed", zap.Uint64("user_id", userID), zap.Error(err))
		return
	}

	expiresIn := token.ExpiresIn
	if expiresIn <= 0 {
		expiresIn = 7200
	}
	now := time.Now().UTC()
	newTokens := repository.WPSTokens{
		AccessToken:  token.AccessToken,
		RefreshToken: token.RefreshToken,
		ExpiresAt:    now.Add(time.Duration(expiresIn) * time.Second),
	}
	if newTokens.RefreshToken == "" {
		newTokens.RefreshToken = tokens.RefreshToken
	}
	if token.RefreshExpiresIn > 0 {
		newTokens.RefreshExpiresAt = now.Add(time.Duration(token.RefreshExpiresIn) * time.Second)
	} else {
		newTokens.RefreshExpiresAt = tokens.RefreshExpiresAt
	}

	if err := h.deps.Repo.UpdateUserWPSTokens(ctx, userID, newTokens); err != nil {
		h.log().Warn("persist refreshed wps tokens failed", zap.Uint64("user_id", userID), zap.Error(err))
	}
}

func (h *AuthHandler) log() *zap.Logger {
	if h.deps.Log != nil {
		return h.deps.Log
	}
	return zap.NewNop()
}

func needsWPSTokenRefresh(tokens repository.WPSTokens, lead time.Duration) bool {
	if tokens.RefreshToken == "" || tokens.ExpiresAt.IsZero() {
		return false
	}
	if !tokens.RefreshExpiresAt.IsZero() && time.Now().After(tokens.RefreshExpiresAt) {
		return false
	}
	return !time.Now().Add(lead).Before(tokens.ExpiresAt)
}

func (h *AuthHandler) loadSession(ctx context.Context, sessionID string) (*session.Record, bool) {
	record, ok := h.deps.Sessions.Get(sessionID)
	if !ok {
		return nil, false
	}
	h.ensureFreshWPSTokens(ctx, record.User.ID)
	return record, true
}
