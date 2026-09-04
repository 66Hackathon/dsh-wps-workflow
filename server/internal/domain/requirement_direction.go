package domain

import (
	"fmt"
	"strings"
)

// NormalizeRequirementDirections parses and validates requirement direction list.
// Allowed values: FRONTEND or BACKEND. New requirements must pick exactly one.
// Legacy rows may still contain "FRONTEND,BACKEND"; parsing keeps them for read paths.
func NormalizeRequirementDirections(raw string) (string, error) {
	parts := strings.Split(raw, ",")
	seen := map[string]bool{}
	out := make([]string, 0, 2)
	for _, part := range parts {
		code := strings.ToUpper(strings.TrimSpace(part))
		if code == "" {
			continue
		}
		if code != DevDirectionFrontend && code != DevDirectionBackend {
			return "", fmt.Errorf("requirement direction must be FRONTEND or BACKEND")
		}
		if seen[code] {
			continue
		}
		seen[code] = true
		out = append(out, code)
	}
	if len(out) == 0 {
		return "", fmt.Errorf("at least one development direction is required")
	}
	// Stable order: FRONTEND then BACKEND
	ordered := make([]string, 0, len(out))
	if seen[DevDirectionFrontend] {
		ordered = append(ordered, DevDirectionFrontend)
	}
	if seen[DevDirectionBackend] {
		ordered = append(ordered, DevDirectionBackend)
	}
	return strings.Join(ordered, ","), nil
}

// NormalizeSingleRequirementDirection enforces one-requirement-one-developer rule.
func NormalizeSingleRequirementDirection(raw string) (string, error) {
	normalized, err := NormalizeRequirementDirections(raw)
	if err != nil {
		return "", err
	}
	if strings.Contains(normalized, ",") {
		return "", fmt.Errorf("one requirement can only have one development direction")
	}
	return normalized, nil
}

// ParseRequirementDirections returns the normalized direction codes.
func ParseRequirementDirections(raw string) []string {
	normalized, err := NormalizeRequirementDirections(raw)
	if err != nil {
		// Fallback for legacy rows
		if strings.TrimSpace(raw) == "" {
			return []string{DevDirectionFrontend}
		}
		return nil
	}
	return strings.Split(normalized, ",")
}

// RequirementNeedsFrontend reports whether FRONTEND is selected.
func RequirementNeedsFrontend(raw string) bool {
	for _, d := range ParseRequirementDirections(raw) {
		if d == DevDirectionFrontend {
			return true
		}
	}
	return false
}

// RequirementNeedsBackend reports whether BACKEND is selected.
func RequirementNeedsBackend(raw string) bool {
	for _, d := range ParseRequirementDirections(raw) {
		if d == DevDirectionBackend {
			return true
		}
	}
	return false
}

// ValidateRequirementDirectionAssignees ensures owners match selected directions.
func ValidateRequirementDirectionAssignees(directions string, frontendUserID, backendUserID uint64) error {
	normalized, err := NormalizeRequirementDirections(directions)
	if err != nil {
		return err
	}
	if RequirementNeedsFrontend(normalized) && frontendUserID == 0 {
		return fmt.Errorf("frontend developer is required when FRONTEND direction is selected")
	}
	if RequirementNeedsBackend(normalized) && backendUserID == 0 {
		return fmt.Errorf("backend developer is required when BACKEND direction is selected")
	}
	if !RequirementNeedsFrontend(normalized) && frontendUserID > 0 {
		return fmt.Errorf("frontend developer should be empty when FRONTEND direction is not selected")
	}
	if !RequirementNeedsBackend(normalized) && backendUserID > 0 {
		return fmt.Errorf("backend developer should be empty when BACKEND direction is not selected")
	}
	return nil
}
