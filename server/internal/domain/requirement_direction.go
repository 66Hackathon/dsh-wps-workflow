package domain

import (
	"fmt"
	"strings"
)

// requirements.development_type holds exactly one track: FRONTEND / BACKEND / MOBILE.
// It is nullable until the requirement enters DEVELOPMENT.

// ValidateDevelopmentType ensures development_type is one of the allowed tracks.
func ValidateDevelopmentType(raw string) error {
	code := strings.ToUpper(strings.TrimSpace(raw))
	if _, ok := DevDirectionLabels[code]; !ok {
		return fmt.Errorf("development_type must be one of: %s", strings.Join(AllowedDevDirections, ", "))
	}
	return nil
}

// NormalizeDevelopmentType validates and upper-cases development_type.
// An empty value is allowed and returned as empty (not yet decided).
func NormalizeDevelopmentType(raw string) (string, error) {
	code := strings.ToUpper(strings.TrimSpace(raw))
	if code == "" {
		return "", nil
	}
	if err := ValidateDevelopmentType(code); err != nil {
		return "", err
	}
	return code, nil
}

// DevelopmentTypeLabel returns the display label for a development_type.
func DevelopmentTypeLabel(raw string) string {
	return DevDirectionLabels[strings.ToUpper(strings.TrimSpace(raw))]
}

// ValidateDevelopmentReadiness ensures a requirement can enter DEVELOPMENT:
// a single development track and its owning developer must both be set.
func ValidateDevelopmentReadiness(developmentType string, developerUserID uint64) error {
	if strings.TrimSpace(developmentType) == "" {
		return fmt.Errorf("development_type is required before entering DEVELOPMENT")
	}
	if err := ValidateDevelopmentType(developmentType); err != nil {
		return err
	}
	if developerUserID == 0 {
		return fmt.Errorf("developer_user_id is required before entering DEVELOPMENT")
	}
	return nil
}
