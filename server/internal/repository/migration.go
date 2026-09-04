package repository

import (
	"context"
	"database/sql"
	"fmt"
)

// EnsureRequirementDirectionSchema upgrades existing databases created before
// requirement-level directions and split frontend/backend completion existed.
func (r *Repository) EnsureRequirementDirectionSchema(ctx context.Context) error {
	columns := []struct {
		name       string
		definition string
	}{
		{"dev_directions", "VARCHAR(64) NOT NULL DEFAULT 'FRONTEND' AFTER expected_at"},
		{"backend_developer_user_id", "BIGINT UNSIGNED NULL AFTER developer_user_id"},
		{"frontend_dev_completed", "TINYINT(1) NOT NULL DEFAULT 0 AFTER tester_user_id"},
		{"backend_dev_completed", "TINYINT(1) NOT NULL DEFAULT 0 AFTER frontend_dev_completed"},
	}
	for _, column := range columns {
		exists, err := r.schemaObjectExists(ctx, "COLUMNS", "COLUMN_NAME", column.name)
		if err != nil {
			return err
		}
		if exists {
			continue
		}
		query := fmt.Sprintf("ALTER TABLE requirements ADD COLUMN `%s` %s", column.name, column.definition)
		if _, err := r.db.ExecContext(ctx, query); err != nil {
			return fmt.Errorf("add requirements.%s: %w", column.name, err)
		}
	}

	exists, err := r.schemaObjectExists(ctx, "STATISTICS", "INDEX_NAME", "idx_requirement_backend_dev")
	if err != nil {
		return err
	}
	if !exists {
		if _, err := r.db.ExecContext(ctx,
			"ALTER TABLE requirements ADD KEY idx_requirement_backend_dev (backend_developer_user_id)"); err != nil {
			return fmt.Errorf("add backend developer index: %w", err)
		}
	}
	return nil
}

func (r *Repository) schemaObjectExists(
	ctx context.Context,
	table, objectColumn, objectName string,
) (bool, error) {
	query := fmt.Sprintf(`
		SELECT 1
		FROM information_schema.%s
		WHERE TABLE_SCHEMA = DATABASE()
		  AND TABLE_NAME = 'requirements'
		  AND %s = ?
		LIMIT 1`, table, objectColumn)
	var one int
	err := r.db.QueryRowContext(ctx, query, objectName).Scan(&one)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}
