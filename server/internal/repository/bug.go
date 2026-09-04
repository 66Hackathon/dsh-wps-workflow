package repository

// repository/bug.go
//
// Bug 子项已整合到 requirements 表（item_type = 'BUG'）。
// 创建 / 查询 Bug 子项请使用 requirement.go 中的方法：
//   - CreateBugItem(ctx, CreateBugItemInput) → creates BUG work-item starting at DEVELOPMENT
//   - ListBugsByRequirement(ctx, parentItemID) → lists BUG sub-items for a parent
//   - CountOpenBugsByRequirement(ctx, parentItemID) → counts open bugs (pre-condition check)
//   - TransitionRequirementStatus(ctx, ...) → bug lifecycle transitions (same as requirement)
//   - UpdateRegressionResult(ctx, ...) → change FAIL regression to PASS
