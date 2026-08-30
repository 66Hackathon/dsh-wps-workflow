package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

func queryIDs(ctx context.Context, tx *sql.Tx, query string, args ...any) ([]uint64, error) {
	rows, err := tx.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := make([]uint64, 0)
	for rows.Next() {
		var id uint64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func deleteByIDs(ctx context.Context, tx *sql.Tx, table, column string, ids []uint64) error {
	if len(ids) == 0 {
		return nil
	}
	placeholders := strings.Repeat("?,", len(ids)-1) + "?"
	args := make([]any, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	_, err := tx.ExecContext(ctx, fmt.Sprintf("DELETE FROM %s WHERE %s IN (%s)", table, column, placeholders), args...)
	return err
}

func deleteConversationsByIDs(ctx context.Context, tx *sql.Tx, conversationIDs []uint64) error {
	if len(conversationIDs) == 0 {
		return nil
	}
	messageIDs, err := queryIDs(ctx, tx, `SELECT id FROM conversation_message WHERE conversation_id IN (`+placeholders(len(conversationIDs))+`)`, uint64Args(conversationIDs)...)
	if err != nil {
		return err
	}
	if err := deleteByIDs(ctx, tx, "message_attachment", "message_id", messageIDs); err != nil {
		return err
	}
	if err := deleteByIDs(ctx, tx, "conversation_message", "conversation_id", conversationIDs); err != nil {
		return err
	}
	return deleteByIDs(ctx, tx, "conversation", "id", conversationIDs)
}

func deleteRequirementsByIDs(ctx context.Context, tx *sql.Tx, requirementIDs []uint64) error {
	if len(requirementIDs) == 0 {
		return nil
	}
	args := uint64Args(requirementIDs)
	in := placeholders(len(requirementIDs))

	childIDs, err := queryIDs(ctx, tx, `SELECT id FROM requirements WHERE parent_requirement_id IN (`+in+`)`, args...)
	if err != nil {
		return err
	}
	if len(childIDs) > 0 {
		if err := deleteRequirementsByIDs(ctx, tx, childIDs); err != nil {
			return err
		}
	}

	conversationIDs, err := queryIDs(ctx, tx, `SELECT id FROM conversation WHERE requirement_id IN (`+in+`)`, args...)
	if err != nil {
		return err
	}
	if err := deleteConversationsByIDs(ctx, tx, conversationIDs); err != nil {
		return err
	}

	bugIDs, err := queryIDs(ctx, tx, `SELECT id FROM bugs WHERE requirement_id IN (`+in+`) OR fix_requirement_id IN (`+in+`)`, append(args, args...)...)
	if err != nil {
		return err
	}
	if len(bugIDs) > 0 {
		bugConversations, err := queryIDs(ctx, tx, `SELECT id FROM conversation WHERE bug_id IN (`+placeholders(len(bugIDs))+`)`, uint64Args(bugIDs)...)
		if err != nil {
			return err
		}
		if err := deleteConversationsByIDs(ctx, tx, bugConversations); err != nil {
			return err
		}
	}
	if err := deleteByIDs(ctx, tx, "bugs", "id", bugIDs); err != nil {
		return err
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM status_change_log WHERE resource_type = 'REQUIREMENT' AND resource_id IN (`+in+`)`, args...); err != nil {
		return err
	}
	if err := deleteByIDs(ctx, tx, "requirement_stage_submissions", "requirement_id", requirementIDs); err != nil {
		return err
	}
	return deleteByIDs(ctx, tx, "requirements", "id", requirementIDs)
}

func deleteProjectGraph(ctx context.Context, tx *sql.Tx, projectID uint64) error {
	requirementIDs, err := queryIDs(ctx, tx, `SELECT id FROM requirements WHERE project_id = ?`, projectID)
	if err != nil {
		return err
	}
	if err := deleteRequirementsByIDs(ctx, tx, requirementIDs); err != nil {
		return err
	}

	conversationIDs, err := queryIDs(ctx, tx, `SELECT id FROM conversation WHERE project_id = ?`, projectID)
	if err != nil {
		return err
	}
	if err := deleteConversationsByIDs(ctx, tx, conversationIDs); err != nil {
		return err
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM bugs WHERE project_id = ?`, projectID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM project_members WHERE project_id = ?`, projectID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM project_setup_steps WHERE project_id = ?`, projectID); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `DELETE FROM projects WHERE id = ?`, projectID)
	return err
}

func clearMemberAssignments(ctx context.Context, tx *sql.Tx, projectID, userID uint64) error {
	_, err := tx.ExecContext(ctx, `
		UPDATE requirements
		SET product_owner_user_id = IF(product_owner_user_id = ?, NULL, product_owner_user_id),
		    developer_user_id = IF(developer_user_id = ?, NULL, developer_user_id),
		    backend_developer_user_id = IF(backend_developer_user_id = ?, NULL, backend_developer_user_id),
		    tester_user_id = IF(tester_user_id = ?, NULL, tester_user_id)
		WHERE project_id = ?`,
		userID, userID, userID, userID, projectID)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
		UPDATE bugs SET assignee_user_id = NULL
		WHERE project_id = ? AND assignee_user_id = ?`, projectID, userID)
	return err
}

func placeholders(n int) string {
	if n <= 0 {
		return ""
	}
	return strings.Repeat("?,", n-1) + "?"
}

func uint64Args(ids []uint64) []any {
	args := make([]any, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	return args
}

// DeleteProject removes a project and all related rows in one transaction.
func (r *Repository) DeleteProject(ctx context.Context, projectID uint64) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if err := deleteProjectGraph(ctx, tx, projectID); err != nil {
		return err
	}
	return tx.Commit()
}
