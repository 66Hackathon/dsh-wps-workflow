package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

type WorkspaceItem struct {
	Type        string  `json:"type"`
	ID          uint64  `json:"id"`
	Code        string  `json:"code"`
	Title       string  `json:"title"`
	ProjectID   uint64  `json:"project_id"`
	ProjectName string  `json:"project_name"`
	Role        string  `json:"role"`
	Status      string  `json:"status"`
	Priority    string  `json:"priority"`
	DueAt       *string `json:"due_at,omitempty"`
	UpdatedAt   string  `json:"updated_at"`
	DueSoon     bool    `json:"due_soon"`
	Overdue     bool    `json:"overdue"`
}

type WorkspaceReminder struct {
	Type       string `json:"type"`
	Title      string `json:"title"`
	ProjectID  uint64 `json:"project_id"`
	ResourceID uint64 `json:"resource_id"`
	OccurredAt string `json:"occurred_at"`
	Unread     bool   `json:"unread"`
}

type WorkspaceWeekStats struct {
	CompletedTasks           int `json:"completed_tasks"`
	ClosedBugs               int `json:"closed_bugs"`
	ParticipatedRequirements int `json:"participated_requirements"`
}

type WorkspaceSummary struct {
	Todos     []WorkspaceItem     `json:"todos"`
	Following []WorkspaceItem     `json:"following"`
	Reminders []WorkspaceReminder `json:"reminders"`
	Week      WorkspaceWeekStats  `json:"week"`
}

func (r *Repository) GetWorkspaceSummary(ctx context.Context, userID uint64) (WorkspaceSummary, error) {
	todos, err := r.listWorkspaceTodos(ctx, userID)
	if err != nil {
		return WorkspaceSummary{}, err
	}
	following, err := r.listWorkspaceFollowing(ctx, userID)
	if err != nil {
		return WorkspaceSummary{}, err
	}
	week, err := r.workspaceWeekStats(ctx, userID)
	if err != nil {
		return WorkspaceSummary{}, err
	}

	reminders := make([]WorkspaceReminder, 0, 3)
	for _, item := range todos {
		if len(reminders) == 3 {
			break
		}
		title := fmt.Sprintf("%s · %s", item.Code, workspaceStatusLabel(item.Status))
		if item.Overdue {
			title = fmt.Sprintf("%s 已逾期，请尽快处理", item.Code)
		} else if item.DueSoon {
			title = fmt.Sprintf("%s 即将到期", item.Code)
		}
		reminders = append(reminders, WorkspaceReminder{
			Type:       item.Type,
			Title:      title,
			ProjectID:  item.ProjectID,
			ResourceID: item.ID,
			OccurredAt: item.UpdatedAt,
			Unread:     item.Overdue || item.DueSoon,
		})
	}

	return WorkspaceSummary{
		Todos:     todos,
		Following: following,
		Reminders: reminders,
		Week:      week,
	}, nil
}

func (r *Repository) listWorkspaceTodos(ctx context.Context, userID uint64) ([]WorkspaceItem, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT
			r.item_type,
			r.id, r.requirement_code, r.title, r.project_id, p.name,
			CASE
				WHEN r.current_status IN ('CREATED', 'PRODUCT_DESIGN', 'PRODUCT_ACCEPTANCE', 'REGRESSION') THEN '产品负责人'
				WHEN r.current_status IN ('DEV_DESIGN', 'DEVELOPMENT') THEN '研发负责人'
				WHEN r.current_status = 'TESTING' THEN '测试负责人'
				ELSE '参与人'
			END AS role_label,
			r.current_status, r.priority,
			DATE_FORMAT(r.expected_at, '%Y-%m-%dT%H:%i:%sZ'),
			DATE_FORMAT(r.updated_at, '%Y-%m-%dT%H:%i:%sZ'),
			(r.expected_at IS NOT NULL AND r.expected_at >= NOW() AND r.expected_at <= DATE_ADD(NOW(), INTERVAL 2 DAY)),
			(r.expected_at IS NOT NULL AND r.expected_at < NOW())
		FROM requirements r
		JOIN projects p ON p.id = r.project_id AND p.status = 'ACTIVE'
		JOIN project_members pm ON pm.project_id = r.project_id AND pm.user_id = ?
		WHERE r.closed_at IS NULL
		  AND (
			(r.current_status IN ('CREATED', 'PRODUCT_DESIGN', 'PRODUCT_ACCEPTANCE', 'REGRESSION') AND r.created_by = ?)
			OR (r.current_status IN ('DEV_DESIGN', 'DEVELOPMENT') AND r.developer_user_id = ?)
			OR (r.current_status = 'TESTING' AND r.tester_user_id = ?)
		  )
		ORDER BY overdue DESC, due_soon DESC, updated_at DESC`,
		userID, userID, userID, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanWorkspaceItems(rows)
}

func (r *Repository) listWorkspaceFollowing(ctx context.Context, userID uint64) ([]WorkspaceItem, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT
			r.item_type,
			r.id, r.requirement_code, r.title, r.project_id, p.name,
			'参与成员', r.current_status, r.priority,
			DATE_FORMAT(r.expected_at, '%Y-%m-%dT%H:%i:%sZ'),
			DATE_FORMAT(r.updated_at, '%Y-%m-%dT%H:%i:%sZ'),
			(r.expected_at IS NOT NULL AND r.expected_at >= NOW() AND r.expected_at <= DATE_ADD(NOW(), INTERVAL 2 DAY)),
			(r.expected_at IS NOT NULL AND r.expected_at < NOW())
		FROM requirements r
		JOIN projects p ON p.id = r.project_id AND p.status = 'ACTIVE'
		JOIN project_members pm ON pm.project_id = r.project_id AND pm.user_id = ?
		WHERE r.closed_at IS NULL
		  AND (
			r.created_by = ? OR r.developer_user_id = ? OR r.tester_user_id = ?
		  )
		ORDER BY r.updated_at DESC
		LIMIT 6`,
		userID, userID, userID, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanWorkspaceItems(rows)
}

func scanWorkspaceItems(rows *sql.Rows) ([]WorkspaceItem, error) {
	items := make([]WorkspaceItem, 0)
	for rows.Next() {
		var item WorkspaceItem
		var dueAt sql.NullString
		if err := rows.Scan(
			&item.Type, &item.ID, &item.Code, &item.Title,
			&item.ProjectID, &item.ProjectName, &item.Role, &item.Status,
			&item.Priority, &dueAt, &item.UpdatedAt, &item.DueSoon, &item.Overdue,
		); err != nil {
			return nil, err
		}
		if dueAt.Valid {
			value := dueAt.String
			item.DueAt = &value
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) workspaceWeekStats(ctx context.Context, userID uint64) (WorkspaceWeekStats, error) {
	startOfWeek := time.Now().UTC()
	weekdayOffset := (int(startOfWeek.Weekday()) + 6) % 7
	startOfWeek = time.Date(startOfWeek.Year(), startOfWeek.Month(), startOfWeek.Day()-weekdayOffset, 0, 0, 0, 0, time.UTC)

	var stats WorkspaceWeekStats
	err := r.db.QueryRowContext(ctx, `
		SELECT
			COUNT(DISTINCT CASE
				WHEN resource_type = 'REQUIREMENT' AND to_status IN ('TESTING', 'DONE', 'ARCHIVED')
				THEN CONCAT(resource_type, ':', resource_id) END),
			COUNT(DISTINCT CASE
				WHEN resource_type = 'BUG' AND to_status = 'CLOSED'
				THEN CONCAT(resource_type, ':', resource_id) END),
			COUNT(DISTINCT CASE
				WHEN resource_type = 'REQUIREMENT'
				THEN resource_id END)
		FROM status_change_log
		WHERE operator_user_id = ? AND created_at >= ?`,
		userID, startOfWeek,
	).Scan(&stats.CompletedTasks, &stats.ClosedBugs, &stats.ParticipatedRequirements)
	return stats, err
}

func workspaceStatusLabel(status string) string {
	labels := map[string]string{
		"CREATED":            "待产品设计",
		"PRODUCT_DESIGN":     "产品设计中",
		"DEV_DESIGN":         "研发方案设计中",
		"DEVELOPMENT":        "研发处理中",
		"TESTING":            "测试中",
		"PRODUCT_ACCEPTANCE": "待产品验收",
		"REGRESSION":         "回归测试中",
		"CLOSED":             "已关闭",
	}
	if label, ok := labels[status]; ok {
		return label
	}
	return status
}
