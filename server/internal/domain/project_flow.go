package domain

import "fmt"

// ValidateProjectCreate ensures core project fields are filled (non-WPS).
func ValidateProjectCreate(code, name, description string, ownerUserID uint64) error {
	if ownerUserID == 0 {
		return fmt.Errorf("owner_user_id is required")
	}
	if len(code) < 2 {
		return fmt.Errorf("project_code is required")
	}
	if len(name) < 2 {
		return fmt.Errorf("name is required")
	}
	if len(description) < 10 {
		return fmt.Errorf("description must be at least 10 characters")
	}
	return nil
}
