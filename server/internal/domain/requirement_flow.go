package domain

import (
	"fmt"
	"strings"
)

// Requirement statuses (state machine nodes).
const (
	StatusProductEditing = "PRODUCT_EDITING"
	StatusProductReview  = "PRODUCT_REVIEW"
	StatusDevelopment    = "DEVELOPMENT"
	StatusTesting        = "TESTING"
	StatusBugFixing      = "BUG_FIXING"
	StatusDone           = "DONE"
	StatusArchived       = "ARCHIVED"
)

// Development scopes.
const (
	ScopeFunctional = "FUNCTIONAL"
	ScopeBugFix     = "BUG_FIX"
)

// Stage codes (exit gates — submission must be filled before leaving the stage).
const (
	StageProductEditing      = "PRODUCT_EDITING"
	StageProductReview       = "PRODUCT_REVIEW"
	StageDevelopment         = "DEVELOPMENT"
	StageDevelopmentFrontend = "DEVELOPMENT_FRONTEND"
	StageDevelopmentBackend  = "DEVELOPMENT_BACKEND"
	StageTesting             = "TESTING"
	StageBugFixing           = "BUG_FIXING"
	StageDone                = "DONE"
)

// Review / test result enums.
const (
	ReviewApproved = "APPROVED"
	ReviewRejected = "REJECTED"
	TestPass       = "PASS"
	TestFail       = "FAIL"
	TestBlocked    = "BLOCKED"
)

// TransitionRule defines a valid status change and required stage submission.
type TransitionRule struct {
	FromStatus        string
	ToStatus          string
	RequiredStageCode string
	Description       string
}

// RequirementTransitionRules is the authoritative requirement state machine.
var RequirementTransitionRules = []TransitionRule{
	{StatusProductEditing, StatusProductReview, StageProductEditing, "产品提交评审：须填写需求规格与验收标准"},
	{StatusProductReview, StatusDevelopment, StageProductReview, "评审通过：须填写评审结论（通过）"},
	{StatusProductReview, StatusProductEditing, StageProductReview, "评审驳回：须填写评审结论（驳回）"},
	{StatusDevelopment, StatusTesting, StageDevelopment, "研发完成：须填写实现说明与负责人"},
	{StatusDevelopment, StatusDone, StageDevelopment, "缺陷修复完成：Bug 修复需求直接完成"},
	{StatusTesting, StatusDone, StageTesting, "测试通过：须填写测试报告（通过）"},
	{StatusTesting, StatusBugFixing, StageTesting, "测试失败：创建缺陷并进入 Bug 修复"},
	{StatusBugFixing, StatusTesting, StageBugFixing, "缺陷修复确认：返回测试复验"},
	{StatusTesting, StatusDevelopment, StageTesting, "测试失败：须填写测试报告（失败）并退回研发"},
	{StatusDone, StatusArchived, StageDone, "产品验收通过：须填写验收说明并归档"},
	{StatusDone, StatusDevelopment, StageDone, "产品验收失败：须填写失败原因并退回研发"},
}

// StageSubmissionInput is the payload submitted when exiting a stage.
type StageSubmissionInput struct {
	SpecBody               string
	AcceptanceCriteria     string
	ProductOwnerUserID     uint64
	ReviewResult           string
	ReviewComment          string
	ReviewerUserID         uint64
	DevSummary             string
	DeveloperUserID        uint64
	BackendDeveloperUserID uint64
	ImplementationNotes    string
	TestSummary            string
	TestResult             string
	TesterUserID           uint64
	TestCasesCovered       string
	ReleaseNote            string
	ClosedByUserID         uint64
	Remark                 string
}

// FindTransitionRule returns the rule for from→to or nil.
func FindTransitionRule(fromStatus, toStatus string) *TransitionRule {
	for i := range RequirementTransitionRules {
		rule := &RequirementTransitionRules[i]
		if rule.FromStatus == fromStatus && rule.ToStatus == toStatus {
			return rule
		}
	}
	return nil
}

// ValidateTransitionOperator ensures stage transitions are performed by the
// assigned role (product owner for product stages, developers for development,
// tester for testing).
func ValidateTransitionOperator(
	operatorID uint64,
	productOwnerUserID uint64,
	frontendDeveloperUserID uint64,
	backendDeveloperUserID uint64,
	testerUserID uint64,
	stageCode string,
	sub StageSubmissionInput,
) error {
	switch stageCode {
	case StageProductEditing, StageProductReview:
		if productOwnerUserID == 0 {
			return fmt.Errorf("requirement has no product owner assigned")
		}
		if operatorID != productOwnerUserID {
			return fmt.Errorf("only the product owner can perform this action")
		}
		if stageCode == StageProductReview {
			if sub.ReviewerUserID == 0 {
				return fmt.Errorf("reviewer_user_id is required")
			}
			if sub.ReviewerUserID != productOwnerUserID {
				return fmt.Errorf("reviewer must be the product owner")
			}
		}
	case StageDevelopment:
		if frontendDeveloperUserID == 0 && backendDeveloperUserID == 0 {
			return fmt.Errorf("requirement has no developer assigned")
		}
		if operatorID != frontendDeveloperUserID && operatorID != backendDeveloperUserID {
			return fmt.Errorf("only the assigned developers can complete development")
		}
	case StageTesting, StageBugFixing:
		if testerUserID == 0 {
			return fmt.Errorf("requirement has no tester assigned")
		}
		if operatorID != testerUserID {
			return fmt.Errorf("only the assigned tester can complete testing")
		}
	case StageDone:
		if productOwnerUserID == 0 {
			return fmt.Errorf("requirement has no product owner assigned")
		}
		if operatorID != productOwnerUserID {
			return fmt.Errorf("only the product owner can perform acceptance")
		}
	}
	return nil
}

// ValidateUniqueRequirementRoles ensures each user holds at most one functional role on a requirement.
func ValidateUniqueRequirementRoles(
	productOwnerUserID uint64,
	frontendDeveloperUserID uint64,
	backendDeveloperUserID uint64,
	testerUserID uint64,
) error {
	type rolePair struct {
		label  string
		userID uint64
	}
	roles := []rolePair{
		{"product owner", productOwnerUserID},
		{"frontend developer", frontendDeveloperUserID},
		{"backend developer", backendDeveloperUserID},
		{"tester", testerUserID},
	}
	seen := make(map[uint64]string)
	for _, role := range roles {
		if role.userID == 0 {
			continue
		}
		if prev, ok := seen[role.userID]; ok {
			return fmt.Errorf("user %d cannot hold multiple roles (%s and %s)", role.userID, prev, role.label)
		}
		seen[role.userID] = role.label
	}
	return nil
}

// ValidateStageSubmission ensures all required fields for the stage are filled with real values.
func ValidateStageSubmission(stageCode string, sub StageSubmissionInput, toStatus string) error {
	switch stageCode {
	case StageProductEditing:
		if strings.TrimSpace(sub.SpecBody) == "" {
			return fmt.Errorf("spec_body is required")
		}
		if strings.TrimSpace(sub.AcceptanceCriteria) == "" {
			return fmt.Errorf("acceptance_criteria is required")
		}
		if sub.ProductOwnerUserID == 0 {
			return fmt.Errorf("product_owner_user_id is required")
		}
	case StageProductReview:
		result := strings.ToUpper(strings.TrimSpace(sub.ReviewResult))
		if result != ReviewApproved && result != ReviewRejected {
			return fmt.Errorf("review_result must be APPROVED or REJECTED")
		}
		if strings.TrimSpace(sub.ReviewComment) == "" {
			return fmt.Errorf("review_comment is required")
		}
		if sub.ReviewerUserID == 0 {
			return fmt.Errorf("reviewer_user_id is required")
		}
		if toStatus == StatusDevelopment && result != ReviewApproved {
			return fmt.Errorf("transition to DEVELOPMENT requires review_result APPROVED")
		}
		if toStatus == StatusProductEditing && result != ReviewRejected {
			return fmt.Errorf("transition to PRODUCT_EDITING requires review_result REJECTED")
		}
		if toStatus == StatusDevelopment {
			if sub.DeveloperUserID == 0 {
				return fmt.Errorf("developer_user_id is required")
			}
			if sub.BackendDeveloperUserID == 0 {
				return fmt.Errorf("backend_developer_user_id is required")
			}
			if sub.TesterUserID == 0 {
				return fmt.Errorf("tester_user_id is required")
			}
			if err := ValidateUniqueRequirementRoles(
				sub.ReviewerUserID,
				sub.DeveloperUserID,
				sub.BackendDeveloperUserID,
				sub.TesterUserID,
			); err != nil {
				return err
			}
		}
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
		if result != TestPass && result != TestFail && result != TestBlocked {
			return fmt.Errorf("test_result must be PASS, FAIL or BLOCKED")
		}
		if strings.TrimSpace(sub.TestSummary) == "" {
			return fmt.Errorf("test_summary is required")
		}
		if strings.TrimSpace(sub.TestCasesCovered) == "" {
			return fmt.Errorf("test_cases_covered is required")
		}
		if sub.TesterUserID == 0 {
			return fmt.Errorf("tester_user_id is required")
		}
		if toStatus == StatusDone && result != TestPass {
			return fmt.Errorf("transition to DONE requires test_result PASS")
		}
		if toStatus == StatusDevelopment && result != TestFail {
			return fmt.Errorf("transition to DEVELOPMENT requires test_result FAIL")
		}
		if toStatus == StatusBugFixing && result != TestFail {
			return fmt.Errorf("transition to BUG_FIXING requires test_result FAIL")
		}
	case StageBugFixing:
		// Tester confirms all linked bug fixes; remark is optional.
		return nil
	case StageDone:
		result := strings.ToUpper(strings.TrimSpace(sub.ReviewResult))
		if result != ReviewApproved && result != ReviewRejected {
			return fmt.Errorf("review_result must be APPROVED or REJECTED for product acceptance")
		}
		if strings.TrimSpace(sub.ReviewComment) == "" {
			return fmt.Errorf("review_comment is required")
		}
		if toStatus == StatusArchived {
			if result != ReviewApproved {
				return fmt.Errorf("transition to ARCHIVED requires review_result APPROVED")
			}
			if strings.TrimSpace(sub.ReleaseNote) == "" {
				return fmt.Errorf("release_note is required")
			}
			if sub.ClosedByUserID == 0 {
				return fmt.Errorf("closed_by_user_id is required")
			}
		}
		if toStatus == StatusDevelopment {
			if result != ReviewRejected {
				return fmt.Errorf("transition to DEVELOPMENT requires review_result REJECTED")
			}
		}
	default:
		return fmt.Errorf("unknown stage_code %s", stageCode)
	}
	return nil
}
