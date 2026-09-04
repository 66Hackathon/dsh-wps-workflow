package handler

// handler/bug.go
//
// Bug 子项已整合进工作项体系（item_type = 'BUG'）。
// Bug 子项的创建、流转、查询均通过 RequirementHandler 提供：
//
//   POST   /api/requirements/{id}/bugs          → handleCreateBug     （创建 Bug 子项）
//   GET    /api/requirements/{id}/bugs          → handleListBugs      （查询 Bug 子项）
//   POST   /api/requirements/{id}/transition    → handleTransition    （Bug 生命周期流转）
//   PATCH  /api/requirements/{id}/regression    → handleUpdateRegression（回归 FAIL → PASS）
//
// 独立的 /api/bugs/* 路由已移除。BugHandler 保留空结构以防旧引用报编译错误。

import (
	"github.com/66hackathon/dsh-wps-workflow/server/internal/repository"
)

// BugHandler is intentionally empty; all bug logic lives in RequirementHandler.
type BugHandler struct {
	repo *repository.Repository
	auth *AuthHandler
}

func NewBugHandler(repo *repository.Repository, auth *AuthHandler) *BugHandler {
	return &BugHandler{repo: repo, auth: auth}
}
