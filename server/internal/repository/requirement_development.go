package repository

// repository/requirement_development.go
//
// 单研发模型：研发完成直接调用 TransitionRequirementStatus 提交
// DEVELOPMENT → TESTING，不再拆分前后端两个 sub-stage。
// 此文件保留为将来扩展用，当前逻辑已内联到 TransitionRequirementStatus。
