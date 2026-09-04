package repository

import "context"

// EnsureRequirementDirectionSchema is a no-op: the authoritative schema is
// recreated by deploy/mysql/schema.sql (make mysql-init). Kept so main.go
// startup wiring stays stable.
func (r *Repository) EnsureRequirementDirectionSchema(ctx context.Context) error {
	return nil
}
