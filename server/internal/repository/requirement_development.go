package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/domain"
)

// DevelopmentCompletionResult reports the persisted completion state after one
// assigned developer submits their track.
type DevelopmentCompletionResult struct {
	Requirement       Requirement `json:"requirement"`
	FrontendCompleted bool        `json:"frontend_completed"`
	BackendCompleted  bool        `json:"backend_completed"`
	Transitioned      bool        `json:"transitioned"`
}

// CompleteDevelopmentTrack records one assigned developer's completion. The
// requirement remains in DEVELOPMENT until both frontend and backend tracks
// have been submitted.
func (r *Repository) CompleteDevelopmentTrack(
	ctx context.Context,
	requirementID, operatorID uint64,
	devSummary, implementationNotes string,
) (DevelopmentCompletionResult, error) {
	if strings.TrimSpace(devSummary) == "" {
		return DevelopmentCompletionResult{}, fmt.Errorf("dev_summary is required")
	}
	if strings.TrimSpace(implementationNotes) == "" {
		return DevelopmentCompletionResult{}, fmt.Errorf("implementation_notes is required")
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return DevelopmentCompletionResult{}, err
	}
	defer func() { _ = tx.Rollback() }()

	status, roles, err := r.lockRequirementForTransition(ctx, tx, requirementID)
	if err != nil {
		return DevelopmentCompletionResult{}, err
	}
	if status != domain.StatusDevelopment {
		return DevelopmentCompletionResult{}, fmt.Errorf("requirement is not in development")
	}

	stageCode := ""
	switch operatorID {
	case roles.DeveloperUserID:
		stageCode = domain.StageDevelopmentFrontend
	case roles.BackendDeveloperUserID:
		stageCode = domain.StageDevelopmentBackend
	default:
		return DevelopmentCompletionResult{}, fmt.Errorf("permission denied: only the assigned developers can complete development")
	}

	if _, err := r.upsertStageSubmissionTx(ctx, tx, requirementID, stageCode, operatorID, StageSubmissionInput{
		DevSummary:          devSummary,
		ImplementationNotes: implementationNotes,
		DeveloperUserID:     operatorID,
	}); err != nil {
		return DevelopmentCompletionResult{}, err
	}

	frontendDone, backendDone, err := developmentCompletionStateTx(ctx, tx, requirementID)
	if err != nil {
		return DevelopmentCompletionResult{}, err
	}
	if err := tx.Commit(); err != nil {
		return DevelopmentCompletionResult{}, err
	}

	if frontendDone && backendDone {
		item, err := r.TransitionRequirementStatus(ctx, requirementID, operatorID, domain.StatusTesting, StageSubmissionInput{
			DevSummary:          "前端与后端研发均已提交完成。",
			ImplementationNotes: "前后端研发完成状态已校验，进入测试阶段。",
			DeveloperUserID:     roles.DeveloperUserID,
			Remark:              "前后端研发均已完成，进入测试阶段。",
		})
		if err != nil {
			return DevelopmentCompletionResult{}, err
		}
		return DevelopmentCompletionResult{
			Requirement:       item,
			FrontendCompleted: true,
			BackendCompleted:  true,
			Transitioned:      true,
		}, nil
	}

	item, err := r.GetRequirement(ctx, requirementID)
	if err != nil {
		return DevelopmentCompletionResult{}, err
	}
	return DevelopmentCompletionResult{
		Requirement:       item,
		FrontendCompleted: frontendDone,
		BackendCompleted:  backendDone,
	}, nil
}

func developmentCompletionStateTx(
	ctx context.Context,
	tx *sql.Tx,
	requirementID uint64,
) (frontendDone, backendDone bool, err error) {
	err = tx.QueryRowContext(ctx, `
		SELECT
			EXISTS(
				SELECT 1 FROM requirement_stage_submissions
				WHERE requirement_id = ? AND stage_code = ?
			),
			EXISTS(
				SELECT 1 FROM requirement_stage_submissions
				WHERE requirement_id = ? AND stage_code = ?
			)`,
		requirementID, domain.StageDevelopmentFrontend,
		requirementID, domain.StageDevelopmentBackend,
	).Scan(&frontendDone, &backendDone)
	return frontendDone, backendDone, err
}
