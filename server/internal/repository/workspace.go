package repository

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strings"
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

// WorkspaceActivity is a project feed item for members of the project.
type WorkspaceActivity struct {
	ID           uint64 `json:"id"`
	Kind         string `json:"kind"` // STATUS_CHANGE | STAGE_SUBMIT | CREATE
	Type         string `json:"type"` // REQUIREMENT | BUG
	ResourceID   uint64 `json:"resource_id"`
	Code         string `json:"code"`
	Title        string `json:"title"`
	ProjectID    uint64 `json:"project_id"`
	ProjectName  string `json:"project_name"`
	Text         string `json:"text"`
	FromStatus   string `json:"from_status,omitempty"`
	ToStatus     string `json:"to_status,omitempty"`
	OperatorName string `json:"operator_name"`
	OccurredAt   string `json:"occurred_at"`
	Tone         string `json:"tone"`
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
	Todos      []WorkspaceItem     `json:"todos"`
	Following  []WorkspaceActivity `json:"following"` // 项目动态（我参与项目中的流转）
	Activities []WorkspaceActivity `json:"activities"`
	Reminders  []WorkspaceReminder `json:"reminders"`
	Week       WorkspaceWeekStats  `json:"week"`
}

func (r *Repository) GetWorkspaceSummary(ctx context.Context, userID uint64) (WorkspaceSummary, error) {
	todos, err := r.listWorkspaceTodos(ctx, userID)
	if err != nil {
		return WorkspaceSummary{}, err
	}
	activities, err := r.listWorkspaceActivities(ctx, userID)
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
		Todos:      todos,
		Following:  activities,
		Activities: activities,
		Reminders:  reminders,
		Week:       week,
	}, nil
}

// listWorkspaceTodos returns work items whose *current stage* is owned by the user.
// Stage ownership mirrors requirement_flow ValidateTransitionOperator / phase owners:
//
//	产品：CREATED / PRODUCT_DESIGN / PRODUCT_ACCEPTANCE
//	研发：DEV_DESIGN / DEVELOPMENT（含前后端负责人）
//	测试：TESTING / REGRESSION
//	Bug：DEVELOPMENT→研发，TESTING→测试，PRODUCT_ACCEPTANCE→创建人
func (r *Repository) listWorkspaceTodos(ctx context.Context, userID uint64) ([]WorkspaceItem, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT
			r.requirement_type,
			r.id, r.requirement_code, r.title, r.project_id, p.name,
			CASE
				WHEN r.requirement_type = 'BUG' AND r.current_status = 'DEVELOPMENT' THEN '研发负责人'
				WHEN r.requirement_type = 'BUG' AND r.current_status = 'TESTING' THEN '测试负责人'
				WHEN r.requirement_type = 'BUG' AND r.current_status = 'PRODUCT_ACCEPTANCE' THEN '验收人'
				WHEN r.current_status IN ('CREATED', 'PRODUCT_DESIGN', 'PRODUCT_ACCEPTANCE') THEN '产品负责人'
				WHEN r.current_status IN ('DEV_DESIGN', 'DEVELOPMENT') THEN '研发负责人'
				WHEN r.current_status IN ('TESTING', 'REGRESSION') THEN '测试负责人'
				ELSE '参与人'
			END AS role_label,
			r.current_status, r.priority,
			DATE_FORMAT(r.expected_at, '%Y-%m-%dT%H:%i:%sZ'),
			DATE_FORMAT(r.updated_at, '%Y-%m-%dT%H:%i:%sZ'),
			(r.expected_at IS NOT NULL AND r.expected_at >= NOW() AND r.expected_at <= DATE_ADD(NOW(), INTERVAL 2 DAY)) AS due_soon,
			(r.expected_at IS NOT NULL AND r.expected_at < NOW()) AS overdue
		FROM requirements r
		JOIN projects p ON p.id = r.project_id AND p.status = 'ACTIVE'
		JOIN project_members pm ON pm.project_id = r.project_id AND pm.user_id = ?
		WHERE r.completed_at IS NULL
		  AND r.current_status != 'COMPLETED'
		  AND (
			-- 普通需求：当前阶段负责人
			(r.requirement_type = 'REQUIREMENT'
				AND r.current_status IN ('CREATED', 'PRODUCT_DESIGN', 'PRODUCT_ACCEPTANCE')
				AND r.created_by = ?)
			OR (r.requirement_type = 'REQUIREMENT'
				AND r.current_status IN ('DEV_DESIGN', 'DEVELOPMENT')
				AND (r.developer_user_id = ? OR r.backend_developer_user_id = ?))
			OR (r.requirement_type = 'REQUIREMENT'
				AND r.current_status IN ('TESTING', 'REGRESSION')
				AND r.tester_user_id = ?)
			-- Bug 子项：当前阶段负责人
			OR (r.requirement_type = 'BUG'
				AND r.current_status = 'DEVELOPMENT'
				AND (r.developer_user_id = ? OR r.backend_developer_user_id = ?))
			OR (r.requirement_type = 'BUG'
				AND r.current_status = 'TESTING'
				AND r.tester_user_id = ?)
			OR (r.requirement_type = 'BUG'
				AND r.current_status = 'PRODUCT_ACCEPTANCE'
				AND r.created_by = ?)
		  )
		ORDER BY overdue DESC, due_soon DESC, r.updated_at DESC`,
		userID,
		userID,
		userID, userID,
		userID,
		userID, userID,
		userID,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanWorkspaceItems(rows)
}

func (r *Repository) listWorkspaceActivities(ctx context.Context, userID uint64) ([]WorkspaceActivity, error) {
	type rawEvent struct {
		id          uint64
		kind        string
		itemType    string
		resourceID  uint64
		code        string
		title       string
		projectID   uint64
		projectName string
		fromStatus  string
		toStatus    string
		stageCode   string
		remark      string
		operatorID  uint64
		occurredAt  string
	}

	events := make([]rawEvent, 0, 40)

	statusRows, err := r.db.QueryContext(ctx, `
		SELECT
			scl.id,
			COALESCE(req.requirement_type, 'REQUIREMENT'),
			req.id,
			req.requirement_code,
			req.title,
			p.id,
			p.name,
			COALESCE(scl.from_status, ''),
			scl.to_status,
			COALESCE(scl.remark, ''),
			scl.operator_user_id,
			DATE_FORMAT(scl.created_at, '%Y-%m-%dT%H:%i:%sZ')
		FROM status_change_logs scl
		JOIN requirements req ON req.id = scl.requirement_id
		JOIN projects p ON p.id = req.project_id AND p.status = 'ACTIVE'
		JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
		ORDER BY scl.created_at DESC, scl.id DESC
		LIMIT 30`, userID)
	if err != nil {
		return nil, err
	}
	defer statusRows.Close()
	for statusRows.Next() {
		var e rawEvent
		e.kind = "STATUS_CHANGE"
		if err := statusRows.Scan(
			&e.id, &e.itemType, &e.resourceID, &e.code, &e.title,
			&e.projectID, &e.projectName, &e.fromStatus, &e.toStatus, &e.remark,
			&e.operatorID, &e.occurredAt,
		); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	if err := statusRows.Err(); err != nil {
		return nil, err
	}

	stageRows, err := r.db.QueryContext(ctx, `
		SELECT
			ss.id,
			COALESCE(req.requirement_type, 'REQUIREMENT'),
			req.id,
			req.requirement_code,
			req.title,
			p.id,
			p.name,
			ss.stage_code,
			ss.operator_user_id,
			DATE_FORMAT(ss.submitted_at, '%Y-%m-%dT%H:%i:%sZ')
		FROM requirement_stage_submissions ss
		JOIN requirements req ON req.id = ss.requirement_id
		JOIN projects p ON p.id = req.project_id AND p.status = 'ACTIVE'
		JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
		ORDER BY ss.submitted_at DESC, ss.id DESC
		LIMIT 30`, userID)
	if err != nil {
		return nil, err
	}
	defer stageRows.Close()
	for stageRows.Next() {
		var e rawEvent
		e.kind = "STAGE_SUBMIT"
		if err := stageRows.Scan(
			&e.id, &e.itemType, &e.resourceID, &e.code, &e.title,
			&e.projectID, &e.projectName, &e.stageCode, &e.operatorID, &e.occurredAt,
		); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	if err := stageRows.Err(); err != nil {
		return nil, err
	}

	createRows, err := r.db.QueryContext(ctx, `
		SELECT
			req.id,
			COALESCE(req.requirement_type, 'REQUIREMENT'),
			req.id,
			req.requirement_code,
			req.title,
			p.id,
			p.name,
			req.created_by,
			DATE_FORMAT(req.created_at, '%Y-%m-%dT%H:%i:%sZ')
		FROM requirements req
		JOIN projects p ON p.id = req.project_id AND p.status = 'ACTIVE'
		JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
		ORDER BY req.created_at DESC, req.id DESC
		LIMIT 20`, userID)
	if err != nil {
		return nil, err
	}
	defer createRows.Close()
	for createRows.Next() {
		var e rawEvent
		e.kind = "CREATE"
		if err := createRows.Scan(
			&e.id, &e.itemType, &e.resourceID, &e.code, &e.title,
			&e.projectID, &e.projectName, &e.operatorID, &e.occurredAt,
		); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	if err := createRows.Err(); err != nil {
		return nil, err
	}

	sort.SliceStable(events, func(i, j int) bool {
		if events[i].occurredAt == events[j].occurredAt {
			return events[i].id > events[j].id
		}
		return events[i].occurredAt > events[j].occurredAt
	})

	// 已有状态流转日志的工作项，不再重复展示阶段提交
	hasStatusChange := make(map[uint64]struct{})
	for _, e := range events {
		if e.kind == "STATUS_CHANGE" {
			hasStatusChange[e.resourceID] = struct{}{}
		}
	}

	operatorIDs := make([]uint64, 0, len(events))
	for _, e := range events {
		operatorIDs = append(operatorIDs, e.operatorID)
	}
	names, err := r.mapUserDisplayNames(ctx, operatorIDs)
	if err != nil {
		return nil, err
	}

	seen := make(map[string]struct{})
	out := make([]WorkspaceActivity, 0, 12)
	for _, e := range events {
		if e.kind == "STAGE_SUBMIT" {
			if _, ok := hasStatusChange[e.resourceID]; ok {
				continue
			}
		}
		// 创建事件：若已有后续流转/提交，仍保留创建作为时间线起点，但限制同资源只出现一次
		dedupeKey := fmt.Sprintf("%s:%d:%s", e.kind, e.id, e.occurredAt)
		if e.kind == "CREATE" {
			dedupeKey = fmt.Sprintf("CREATE:%d", e.resourceID)
		}
		if _, ok := seen[dedupeKey]; ok {
			continue
		}
		seen[dedupeKey] = struct{}{}

		actor := names[e.operatorID]
		if actor == "" {
			actor = "成员"
		}
		item := WorkspaceActivity{
			ID:           e.id,
			Kind:         e.kind,
			Type:         e.itemType,
			ResourceID:   e.resourceID,
			Code:         e.code,
			Title:        e.title,
			ProjectID:    e.projectID,
			ProjectName:  e.projectName,
			FromStatus:   e.fromStatus,
			ToStatus:     e.toStatus,
			OperatorName: actor,
			OccurredAt:   e.occurredAt,
		}
		switch e.kind {
		case "STATUS_CHANGE":
			item.Tone = activityTone(e.toStatus)
			item.Text = actor + " " + formatStatusChangeText(e.remark, e.code, e.title, e.fromStatus, e.toStatus)
		case "STAGE_SUBMIT":
			item.Tone = activityTone(e.stageCode)
			item.ToStatus = e.stageCode
			item.Text = fmt.Sprintf("%s 提交了%s · %s", actor, workspaceStageLabel(e.stageCode), e.title)
		case "CREATE":
			item.Tone = "blue"
			kindLabel := "需求"
			if e.itemType == "BUG" {
				kindLabel = "Bug"
			}
			item.Text = fmt.Sprintf("%s 创建了%s · %s", actor, kindLabel, e.title)
		}
		out = append(out, item)
		if len(out) >= 12 {
			break
		}
	}
	return out, nil
}

func formatStatusChangeText(remark, code, title, fromStatus, toStatus string) string {
	remark = strings.TrimSpace(remark)
	if remark != "" {
		return fmt.Sprintf("%s · %s", remark, title)
	}
	if fromStatus != "" {
		return fmt.Sprintf("将 %s 从「%s」流转至「%s」", code, workspaceStatusLabel(fromStatus), workspaceStatusLabel(toStatus))
	}
	return fmt.Sprintf("将 %s 流转至「%s」", code, workspaceStatusLabel(toStatus))
}

func workspaceStageLabel(stage string) string {
	labels := map[string]string{
		"PRODUCT_DESIGN":     "产品方案",
		"DEV_DESIGN":         "研发方案",
		"DEVELOPMENT":        "研发完成说明",
		"TESTING":            "测试结果",
		"PRODUCT_ACCEPTANCE": "产品验收",
		"REGRESSION":         "回归结果",
	}
	if label, ok := labels[stage]; ok {
		return label
	}
	return stage
}

func activityTone(status string) string {
	switch status {
	case "DEVELOPMENT", "DEV_DESIGN":
		return "green"
	case "TESTING", "REGRESSION":
		return "purple"
	case "PRODUCT_ACCEPTANCE", "PRODUCT_DESIGN":
		return "orange"
	case "COMPLETED", "CLOSED":
		return "red"
	default:
		return "blue"
	}
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
				WHEN COALESCE(req.requirement_type, 'REQUIREMENT') = 'REQUIREMENT'
					AND scl.to_status IN ('TESTING', 'PRODUCT_ACCEPTANCE', 'REGRESSION', 'COMPLETED')
				THEN scl.requirement_id END),
			COUNT(DISTINCT CASE
				WHEN req.requirement_type = 'BUG'
					AND scl.to_status = 'COMPLETED'
				THEN scl.requirement_id END),
			COUNT(DISTINCT scl.requirement_id)
		FROM status_change_logs scl
		LEFT JOIN requirements req ON req.id = scl.requirement_id
		WHERE scl.operator_user_id = ? AND scl.created_at >= ?`,
		userID, startOfWeek,
	).Scan(&stats.CompletedTasks, &stats.ClosedBugs, &stats.ParticipatedRequirements)
	return stats, err
}

func workspaceStatusLabel(status string) string {
	labels := map[string]string{
		"PRODUCT_DESIGN":     "产品设计中",
		"DEV_DESIGN":         "研发方案设计中",
		"DEVELOPMENT":        "研发处理中",
		"TESTING":            "测试中",
		"PRODUCT_ACCEPTANCE": "待产品验收",
		"REGRESSION":         "回归测试中",
		"COMPLETED":          "已完成",
		"CLOSED":             "已关闭",
	}
	if label, ok := labels[status]; ok {
		return label
	}
	return status
}
