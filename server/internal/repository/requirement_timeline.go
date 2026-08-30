package repository

import (
	"context"
	"database/sql"
	"time"
)

// RequirementStageSubmission is a persisted stage exit record.
type RequirementStageSubmission struct {
	ID                   uint64     `json:"id"`
	RequirementID        uint64     `json:"requirement_id"`
	StageCode            string     `json:"stage_code"`
	SpecBody             *string    `json:"spec_body,omitempty"`
	AcceptanceCriteria   *string    `json:"acceptance_criteria,omitempty"`
	ProductOwnerUserID   *uint64    `json:"product_owner_user_id,omitempty"`
	ReviewResult         *string    `json:"review_result,omitempty"`
	ReviewComment        *string    `json:"review_comment,omitempty"`
	ReviewerUserID       *uint64    `json:"reviewer_user_id,omitempty"`
	DevSummary           *string    `json:"dev_summary,omitempty"`
	ImplementationNotes  *string    `json:"implementation_notes,omitempty"`
	DeveloperUserID      *uint64    `json:"developer_user_id,omitempty"`
	TestSummary          *string    `json:"test_summary,omitempty"`
	TestCasesCovered     *string    `json:"test_cases_covered,omitempty"`
	TestResult           *string    `json:"test_result,omitempty"`
	TesterUserID         *uint64    `json:"tester_user_id,omitempty"`
	ReleaseNote          *string    `json:"release_note,omitempty"`
	ClosedByUserID       *uint64    `json:"closed_by_user_id,omitempty"`
	OperatorUserID       uint64     `json:"operator_user_id"`
	OperatorName         string     `json:"operator_name,omitempty"`
	SubmittedAt          time.Time  `json:"submitted_at"`
}

// StatusChangeLogEntry is one requirement status transition audit record.
type StatusChangeLogEntry struct {
	ID             uint64    `json:"id"`
	FromStatus     *string   `json:"from_status,omitempty"`
	ToStatus       string    `json:"to_status"`
	OperatorUserID uint64    `json:"operator_user_id"`
	OperatorName   string    `json:"operator_name,omitempty"`
	Remark         string    `json:"remark"`
	CreatedAt      time.Time `json:"created_at"`
}

// RequirementTimeline aggregates stage submissions and status changes.
type RequirementTimeline struct {
	StageSubmissions []RequirementStageSubmission `json:"stage_submissions"`
	StatusChanges    []StatusChangeLogEntry       `json:"status_changes"`
}

// ListRequirementTimeline returns stage submissions and status change log for a requirement.
func (r *Repository) ListRequirementTimeline(ctx context.Context, requirementID uint64) (RequirementTimeline, error) {
	submissions, err := r.listStageSubmissions(ctx, requirementID)
	if err != nil {
		return RequirementTimeline{}, err
	}
	changes, err := r.listRequirementStatusChanges(ctx, requirementID)
	if err != nil {
		return RequirementTimeline{}, err
	}
	return RequirementTimeline{
		StageSubmissions: submissions,
		StatusChanges:    changes,
	}, nil
}

func (r *Repository) listStageSubmissions(ctx context.Context, requirementID uint64) ([]RequirementStageSubmission, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT
			id, requirement_id, stage_code,
			spec_body, acceptance_criteria, product_owner_user_id,
			review_result, review_comment, reviewer_user_id,
			dev_summary, implementation_notes, developer_user_id,
			test_summary, test_cases_covered, test_result, tester_user_id,
			release_note, closed_by_user_id,
			operator_user_id, submitted_at
		FROM requirement_stage_submissions
		WHERE requirement_id = ?
		ORDER BY submitted_at ASC, id ASC`, requirementID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]RequirementStageSubmission, 0)
	operatorIDs := make([]uint64, 0)
	for rows.Next() {
		item, err := scanStageSubmissionRow(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
		operatorIDs = append(operatorIDs, item.OperatorUserID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	names, err := r.mapUserDisplayNames(ctx, operatorIDs)
	if err != nil {
		return nil, err
	}
	for i := range items {
		items[i].OperatorName = names[items[i].OperatorUserID]
	}
	return items, nil
}

func (r *Repository) listRequirementStatusChanges(ctx context.Context, requirementID uint64) ([]StatusChangeLogEntry, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT
			id, from_status, to_status,
			operator_user_id, remark, created_at
		FROM status_change_log
		WHERE resource_type = 'REQUIREMENT' AND resource_id = ?
		ORDER BY created_at ASC, id ASC`, requirementID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]StatusChangeLogEntry, 0)
	operatorIDs := make([]uint64, 0)
	for rows.Next() {
		var item StatusChangeLogEntry
		var fromStatus sql.NullString
		if err := rows.Scan(
			&item.ID, &fromStatus, &item.ToStatus,
			&item.OperatorUserID, &item.Remark, &item.CreatedAt,
		); err != nil {
			return nil, err
		}
		if fromStatus.Valid {
			v := fromStatus.String
			item.FromStatus = &v
		}
		items = append(items, item)
		operatorIDs = append(operatorIDs, item.OperatorUserID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	names, err := r.mapUserDisplayNames(ctx, operatorIDs)
	if err != nil {
		return nil, err
	}
	for i := range items {
		items[i].OperatorName = names[items[i].OperatorUserID]
	}
	return items, nil
}

func scanStageSubmissionRow(row scanner) (RequirementStageSubmission, error) {
	var item RequirementStageSubmission
	var specBody, acceptance, reviewResult, reviewComment sql.NullString
	var devSummary, implNotes, testSummary, testCases, testResult, releaseNote sql.NullString
	var po, reviewer, developer, tester, closedBy sql.NullInt64

	err := row.Scan(
		&item.ID, &item.RequirementID, &item.StageCode,
		&specBody, &acceptance, &po,
		&reviewResult, &reviewComment, &reviewer,
		&devSummary, &implNotes, &developer,
		&testSummary, &testCases, &testResult, &tester,
		&releaseNote, &closedBy,
		&item.OperatorUserID, &item.SubmittedAt,
	)
	if err != nil {
		return RequirementStageSubmission{}, err
	}
	assignNullString(&item.SpecBody, specBody)
	assignNullString(&item.AcceptanceCriteria, acceptance)
	assignNullString(&item.ReviewResult, reviewResult)
	assignNullString(&item.ReviewComment, reviewComment)
	assignNullString(&item.DevSummary, devSummary)
	assignNullString(&item.ImplementationNotes, implNotes)
	assignNullString(&item.TestSummary, testSummary)
	assignNullString(&item.TestCasesCovered, testCases)
	assignNullString(&item.TestResult, testResult)
	assignNullString(&item.ReleaseNote, releaseNote)
	assignNullUint64(&item.ProductOwnerUserID, po)
	assignNullUint64(&item.ReviewerUserID, reviewer)
	assignNullUint64(&item.DeveloperUserID, developer)
	assignNullUint64(&item.TesterUserID, tester)
	assignNullUint64(&item.ClosedByUserID, closedBy)
	return item, nil
}

func assignNullString(target **string, value sql.NullString) {
	if !value.Valid {
		return
	}
	v := value.String
	*target = &v
}

func assignNullUint64(target **uint64, value sql.NullInt64) {
	if !value.Valid {
		return
	}
	v := uint64(value.Int64)
	*target = &v
}
