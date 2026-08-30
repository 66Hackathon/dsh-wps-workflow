package domain

import "testing"

func TestValidateUniqueRequirementRoles(t *testing.T) {
	err := ValidateUniqueRequirementRoles(1, 2, 3, 0)
	if err != nil {
		t.Fatalf("expected unique roles: %v", err)
	}

	err = ValidateUniqueRequirementRoles(1, 1, 3, 0)
	if err == nil {
		t.Fatal("expected duplicate role rejection")
	}
}

func TestValidateStageSubmissionReviewToDevRequiresBothDevs(t *testing.T) {
	err := ValidateStageSubmission(StageProductReview, StageSubmissionInput{
		ReviewResult:           ReviewApproved,
		ReviewComment:          "ok",
		ReviewerUserID:         1,
		DeveloperUserID:        2,
		BackendDeveloperUserID: 3,
		TesterUserID:           4,
	}, StatusDevelopment)
	if err != nil {
		t.Fatalf("expected valid: %v", err)
	}

	err = ValidateStageSubmission(StageProductReview, StageSubmissionInput{
		ReviewResult:    ReviewApproved,
		ReviewComment:   "ok",
		ReviewerUserID:  1,
		DeveloperUserID: 2,
	}, StatusDevelopment)
	if err == nil {
		t.Fatal("expected missing backend developer error")
	}

	err = ValidateStageSubmission(StageProductReview, StageSubmissionInput{
		ReviewResult:           ReviewApproved,
		ReviewComment:          "ok",
		ReviewerUserID:         1,
		DeveloperUserID:        2,
		BackendDeveloperUserID: 3,
	}, StatusDevelopment)
	if err == nil {
		t.Fatal("expected missing tester error")
	}

	err = ValidateStageSubmission(StageProductReview, StageSubmissionInput{
		ReviewResult:           ReviewApproved,
		ReviewComment:          "ok",
		ReviewerUserID:         1,
		DeveloperUserID:        2,
		BackendDeveloperUserID: 2,
		TesterUserID:           4,
	}, StatusDevelopment)
	if err == nil {
		t.Fatal("expected duplicate developer roles error")
	}
}

func TestValidateTransitionOperatorProductOwnerOnly(t *testing.T) {
	err := ValidateTransitionOperator(2, 1, 0, 0, 0, StageProductEditing, StageSubmissionInput{
		ProductOwnerUserID: 1,
	})
	if err == nil {
		t.Fatal("expected non-product-owner to be rejected")
	}

	err = ValidateTransitionOperator(1, 1, 0, 0, 0, StageProductReview, StageSubmissionInput{
		ReviewerUserID: 1,
	})
	if err != nil {
		t.Fatalf("expected product owner to pass: %v", err)
	}

	err = ValidateTransitionOperator(1, 1, 0, 0, 0, StageProductReview, StageSubmissionInput{
		ReviewerUserID: 2,
	})
	if err == nil {
		t.Fatal("expected reviewer mismatch to be rejected")
	}
}

func TestValidateTransitionOperatorDevelopersOnly(t *testing.T) {
	err := ValidateTransitionOperator(1, 1, 2, 3, 4, StageDevelopment, StageSubmissionInput{})
	if err == nil {
		t.Fatal("expected product owner to be rejected for development completion")
	}

	err = ValidateTransitionOperator(2, 1, 2, 3, 4, StageDevelopment, StageSubmissionInput{})
	if err != nil {
		t.Fatalf("expected frontend developer to pass: %v", err)
	}

	err = ValidateTransitionOperator(3, 1, 2, 3, 4, StageDevelopment, StageSubmissionInput{})
	if err != nil {
		t.Fatalf("expected backend developer to pass: %v", err)
	}

	err = ValidateTransitionOperator(5, 1, 2, 3, 4, StageDevelopment, StageSubmissionInput{})
	if err == nil {
		t.Fatal("expected unrelated member to be rejected")
	}
}

func TestValidateTransitionOperatorTesterOnly(t *testing.T) {
	err := ValidateTransitionOperator(1, 1, 2, 3, 4, StageTesting, StageSubmissionInput{})
	if err == nil {
		t.Fatal("expected product owner to be rejected for testing completion")
	}

	err = ValidateTransitionOperator(4, 1, 2, 3, 4, StageTesting, StageSubmissionInput{})
	if err != nil {
		t.Fatalf("expected tester to pass: %v", err)
	}

	err = ValidateTransitionOperator(2, 1, 2, 3, 4, StageTesting, StageSubmissionInput{})
	if err == nil {
		t.Fatal("expected developer to be rejected for testing completion")
	}
}

func TestValidateStageSubmissionProductEditing(t *testing.T) {
	err := ValidateStageSubmission(StageProductEditing, StageSubmissionInput{
		SpecBody:           "spec",
		AcceptanceCriteria: "ac",
		ProductOwnerUserID:   1,
	}, StatusProductReview)
	if err != nil {
		t.Fatalf("expected valid submission: %v", err)
	}

	err = ValidateStageSubmission(StageProductEditing, StageSubmissionInput{}, StatusProductReview)
	if err == nil {
		t.Fatal("expected error for empty submission")
	}
}

func TestValidateStageSubmissionReviewToDev(t *testing.T) {
	err := ValidateStageSubmission(StageProductReview, StageSubmissionInput{
		ReviewResult:           ReviewApproved,
		ReviewComment:          "ok",
		ReviewerUserID:         1,
		DeveloperUserID:        2,
		BackendDeveloperUserID: 3,
		TesterUserID:           4,
	}, StatusDevelopment)
	if err != nil {
		t.Fatalf("expected valid: %v", err)
	}

	err = ValidateStageSubmission(StageProductReview, StageSubmissionInput{
		ReviewResult:   ReviewRejected,
		ReviewComment:  "no",
		ReviewerUserID: 1,
	}, StatusDevelopment)
	if err == nil {
		t.Fatal("expected reject when review rejected but target is development")
	}
}
