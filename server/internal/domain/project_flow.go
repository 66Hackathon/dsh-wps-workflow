package domain

import (
	"fmt"
	"strings"
)

// ValidateProjectCreate ensures core project fields are filled.
// projects has no project_code / status column: the owner is the creator.
func ValidateProjectCreate(name, description string, ownerUserID uint64) error {
	if ownerUserID == 0 {
		return fmt.Errorf("owner_user_id is required")
	}
	if len(strings.TrimSpace(name)) < 2 {
		return fmt.Errorf("name is required")
	}
	if len(strings.TrimSpace(description)) < 10 {
		return fmt.Errorf("description must be at least 10 characters")
	}
	return nil
}
