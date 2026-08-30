package handler

import (
	"context"
	"log"
	"time"

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
		log.Printf("wps token refresh failed user=%d: %v", userID, err)
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
		log.Printf("persist refreshed wps tokens failed user=%d: %v", userID, err)
	}
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
