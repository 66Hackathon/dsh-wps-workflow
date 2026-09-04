package domain

import (
	"fmt"
	"strings"
)

// ── 工作项类型 ────────────────────────────────────────────────────────────────

const (
	ItemTypeRequirement = "REQUIREMENT"
	ItemTypeBug         = "BUG"
)

// ── 状态机节点 ────────────────────────────────────────────────────────────────
//
// 普通需求（REQUIREMENT）完整路径：
//
//	CREATED → PRODUCT_DESIGN → DEV_DESIGN → DEVELOPMENT → TESTING
//	→ PRODUCT_ACCEPTANCE → REGRESSION → CLOSED
//	测试不通过（FAIL）退回：→ DEVELOPMENT（可再次开发后进入测试）
//	测试提交 Bug：新建 BUG 子需求，主需求仍停留在 TESTING（不回滚）
//	产品验收失败退回：→ DEVELOPMENT
//	回归失败：记录结果后仍可关闭；后续可将 FAIL 改为 PASS
//
// Bug 子项（BUG）路径（独立流转，不回滚主需求）：
//
//	DEVELOPMENT → TESTING → PRODUCT_ACCEPTANCE → CLOSED
//	测试/验收失败退回：→ DEVELOPMENT
const (
	StatusCreated           = "CREATED"
	StatusProductDesign     = "PRODUCT_DESIGN"
	StatusDevDesign         = "DEV_DESIGN"
	StatusDevelopment       = "DEVELOPMENT"
	StatusTesting           = "TESTING"
	StatusProductAcceptance = "PRODUCT_ACCEPTANCE"
	StatusRegression        = "REGRESSION"
	StatusClosed            = "CLOSED"
)

// ── 阶段码（对应 requirement_stage_submissions.stage_code）──────────────────

const (
	StageProductDesign     = "PRODUCT_DESIGN"
	StageDevDesign         = "DEV_DESIGN"
	StageDevelopment       = "DEVELOPMENT"
	StageTesting           = "TESTING"
	StageProductAcceptance = "PRODUCT_ACCEPTANCE"
	StageRegression        = "REGRESSION"
)

// ── 测试 / 验收结果 ──────────────────────────────────────────────────────────

const (
	ResultPass      = "PASS"
	ResultFail      = "FAIL"
	ResultSubmitBug = "SUBMIT_BUG" // 仅用于创建 Bug 子需求语义，不触发主需求回滚
)

// ── 转换规则 ─────────────────────────────────────────────────────────────────

// TransitionRule defines a valid status change and required stage submission.
type TransitionRule struct {
	FromStatus        string
	ToStatus          string
	RequiredStageCode string
	Description       string
}

// RequirementTransitionRules：普通需求流转规则
var RequirementTransitionRules = []TransitionRule{
	// 创建后进入产品方案设计（无需提交材料，仅角色校验）
	{StatusCreated, StatusProductDesign, StageProductDesign, "开始产品方案设计"},
	// 产品设计完成 → 研发方案设计
	{StatusProductDesign, StatusDevDesign, StageProductDesign, "产品方案完成：须填写方案正文与验收标准"},
	// 研发方案完成 → 研发中
	{StatusDevDesign, StatusDevelopment, StageDevDesign, "研发方案完成：须填写方案文档"},
	// 研发完成 → 测试
	{StatusDevelopment, StatusTesting, StageDevelopment, "研发完成：须填写研发说明"},
	// 测试通过 → 产品验收
	{StatusTesting, StatusProductAcceptance, StageTesting, "测试通过：须提交测试结果（PASS）"},
	// 测试不通过 → 退回研发（可再次开发后进入测试）
	{StatusTesting, StatusDevelopment, StageTesting, "测试不通过：须提交测试结果（FAIL）并填写退回原因"},
	// 注意：提交 Bug 不在此流转——应新建 BUG 子需求，主需求保持 TESTING
	// 产品验收通过 → 回归测试
	{StatusProductAcceptance, StatusRegression, StageProductAcceptance, "产品验收通过：须填写验收说明（PASS）"},
	// 产品验收失败 → 退回研发
	{StatusProductAcceptance, StatusDevelopment, StageProductAcceptance, "产品验收失败：须填写失败原因（FAIL）"},
	// 回归完成 → 关闭（无论成功/失败，均记录结果后关闭；失败后可手动改为成功）
	{StatusRegression, StatusClosed, StageRegression, "回归完成：须填写回归结果"},
}

// BugTransitionRules：Bug 子项流转规则（无产品设计 / 研发方案阶段）
var BugTransitionRules = []TransitionRule{
	{StatusDevelopment, StatusTesting, StageDevelopment, "Bug 研发完成：须填写修复说明"},
	{StatusTesting, StatusProductAcceptance, StageTesting, "Bug 测试通过：须提交测试结果（PASS）"},
	{StatusTesting, StatusDevelopment, StageTesting, "Bug 测试不通过：须退回研发并填写原因"},
	{StatusProductAcceptance, StatusClosed, StageProductAcceptance, "Bug 产品验收通过：关闭 Bug"},
	{StatusProductAcceptance, StatusDevelopment, StageProductAcceptance, "Bug 产品验收失败：退回研发"},
}

// FindTransitionRule 在对应规则集中查找 from→to 规则（first match）。
func FindTransitionRule(itemType, fromStatus, toStatus string) *TransitionRule {
	rules := RequirementTransitionRules
	if itemType == ItemTypeBug {
		rules = BugTransitionRules
	}
	for i := range rules {
		r := &rules[i]
		if r.FromStatus == fromStatus && r.ToStatus == toStatus {
			return r
		}
	}
	return nil
}

// ── 阶段提交 Payload ──────────────────────────────────────────────────────────

// StageSubmissionInput is the payload submitted when exiting a stage.
type StageSubmissionInput struct {
	// PRODUCT_DESIGN
	SpecBody           string
	AcceptanceCriteria string

	// DEV_DESIGN
	DevDesignDoc string

	// DEVELOPMENT
	DevSummary          string
	ImplementationNotes string
	DeveloperUserID     uint64

	// TESTING / PRODUCT_ACCEPTANCE 退回时的原因
	ReturnReason string

	// TESTING
	TestResult       string // PASS / FAIL / SUBMIT_BUG
	TestSummary      string
	TestCasesCovered string
	TesterUserID     uint64

	// PRODUCT_ACCEPTANCE
	AcceptanceNote string
	AcceptResult   string // PASS / FAIL

	// REGRESSION
	RegressionResult  string // PASS / FAIL
	RegressionSummary string

	// 通用
	Remark string
}

// ── 角色校验 ──────────────────────────────────────────────────────────────────

// ValidateTransitionOperator ensures stage transitions are performed by the correct role.
// createdBy is the product owner (requirement creator).
// developerUserID is the frontend/primary developer; backendDeveloperUserID is the backend developer.
func ValidateTransitionOperator(
	operatorID uint64,
	createdBy uint64,
	developerUserID uint64,
	backendDeveloperUserID uint64,
	testerUserID uint64,
	stageCode string,
) error {
	switch stageCode {
	case StageProductDesign, StageProductAcceptance:
		// 产品方案 / 验收：仅创建者（产品）可操作
		if createdBy == 0 {
			return fmt.Errorf("requirement has no creator (product owner) assigned")
		}
		if operatorID != createdBy {
			return fmt.Errorf("only the product owner (creator) can perform this action")
		}
	case StageDevDesign, StageDevelopment:
		// 研发方案 / 开发：前端或后端负责人可操作
		if developerUserID == 0 && backendDeveloperUserID == 0 {
			return fmt.Errorf("requirement has no developer assigned")
		}
		if operatorID != developerUserID && operatorID != backendDeveloperUserID {
			return fmt.Errorf("only the assigned developer can perform this action")
		}
	case StageTesting:
		// 测试：仅测试人员可操作
		if testerUserID == 0 {
			return fmt.Errorf("requirement has no tester assigned")
		}
		if operatorID != testerUserID {
			return fmt.Errorf("only the assigned tester can perform this action")
		}
	case StageRegression:
		// 回归结果可由测试人员或产品验收人（创建者）提交
		if operatorID != createdBy && operatorID != testerUserID {
			return fmt.Errorf("only the product owner or tester can submit regression result")
		}
	}
	return nil
}

// ── 阶段提交字段校验 ──────────────────────────────────────────────────────────

// ValidateStageSubmission ensures all required fields for the stage are filled.
func ValidateStageSubmission(stageCode string, sub StageSubmissionInput, toStatus string) error {
	switch stageCode {
	case StageProductDesign:
		// 产品方案文档为可选项，允许空提交进入 DEV_DESIGN

	case StageDevDesign:
		// 研发方案文档为可选项，允许空提交进入 DEVELOPMENT

	case StageDevelopment:
		if strings.TrimSpace(sub.DevSummary) == "" {
			return fmt.Errorf("dev_summary is required")
		}
		if strings.TrimSpace(sub.ImplementationNotes) == "" {
			return fmt.Errorf("implementation_notes is required")
		}
		if sub.DeveloperUserID == 0 {
			return fmt.Errorf("developer_user_id is required")
		}

	case StageTesting:
		result := strings.ToUpper(strings.TrimSpace(sub.TestResult))
		if result != ResultPass && result != ResultFail {
			return fmt.Errorf("test_result must be PASS or FAIL")
		}
		if strings.TrimSpace(sub.TestSummary) == "" {
			return fmt.Errorf("test_summary is required")
		}
		if sub.TesterUserID == 0 {
			return fmt.Errorf("tester_user_id is required")
		}
		// 退回研发时需要填写原因
		if result == ResultFail && strings.TrimSpace(sub.ReturnReason) == "" {
			return fmt.Errorf("return_reason is required when test_result is FAIL")
		}
		// 校验目标状态与测试结果一致
		if toStatus == StatusProductAcceptance && result != ResultPass {
			return fmt.Errorf("transition to PRODUCT_ACCEPTANCE requires test_result PASS")
		}
		if toStatus == StatusDevelopment && result != ResultFail {
			return fmt.Errorf("transition to DEVELOPMENT requires test_result FAIL")
		}

	case StageProductAcceptance:
		result := strings.ToUpper(strings.TrimSpace(sub.AcceptResult))
		if result != ResultPass && result != ResultFail {
			return fmt.Errorf("accept_result must be PASS or FAIL")
		}
		if toStatus == StatusRegression && result != ResultPass {
			return fmt.Errorf("transition to REGRESSION requires accept_result PASS")
		}
		if toStatus == StatusDevelopment && result != ResultFail {
			return fmt.Errorf("transition to DEVELOPMENT requires accept_result FAIL")
		}
		// Bug 子项验收通过 → CLOSED
		if toStatus == StatusClosed && result != ResultPass {
			return fmt.Errorf("transition to CLOSED requires accept_result PASS")
		}
		if result == ResultFail && strings.TrimSpace(sub.ReturnReason) == "" {
			return fmt.Errorf("return_reason is required when accept_result is FAIL")
		}

	case StageRegression:
		result := strings.ToUpper(strings.TrimSpace(sub.RegressionResult))
		if result != ResultPass && result != ResultFail {
			return fmt.Errorf("regression_result must be PASS or FAIL")
		}
		if strings.TrimSpace(sub.RegressionSummary) == "" {
			return fmt.Errorf("regression_summary is required")
		}

	default:
		return fmt.Errorf("unknown stage_code: %s", stageCode)
	}
	return nil
}

// ── Bug 子项前置校验 ──────────────────────────────────────────────────────────

// ErrOpenBugItems is returned when a requirement has unclosed bug sub-items.
type ErrOpenBugItems struct {
	Count int
}

func (e ErrOpenBugItems) Error() string {
	return fmt.Sprintf("requirement has %d open bug sub-item(s); close all bugs before continuing", e.Count)
}

// CheckAllBugsClosed returns ErrOpenBugItems if any bug sub-items are not CLOSED.
// openCount should be provided by the repository layer.
func CheckAllBugsClosed(openCount int) error {
	if openCount > 0 {
		return ErrOpenBugItems{Count: openCount}
	}
	return nil
}

// StagesRequiringBugCheck lists the stages where all bug sub-items must be CLOSED
// before the main requirement can proceed.
var StagesRequiringBugCheck = map[string]bool{
	StageTesting:           true, // 测试通过 → 产品验收
	StageProductAcceptance: true, // 验收通过 → 回归
}
