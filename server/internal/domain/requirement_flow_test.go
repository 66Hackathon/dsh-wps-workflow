package domain

import "testing"

func TestNormalizeRequirementDirections(t *testing.T) {
	got, err := NormalizeRequirementDirections("backend,frontend,backend")
	if err != nil {
		t.Fatalf("normalize directions: %v", err)
	}
	if got != "FRONTEND,BACKEND" {
		t.Fatalf("got %q", got)
	}
	if _, err := NormalizeRequirementDirections("MOBILE"); err == nil {
		t.Fatal("MOBILE should not be a requirement direction")
	}
}

func TestValidateTransitionOperatorByStage(t *testing.T) {
	if err := ValidateTransitionOperator(1, 1, 2, 3, 4, StageProductDesign); err != nil {
		t.Fatalf("product owner should operate product design: %v", err)
	}
	if err := ValidateTransitionOperator(2, 1, 2, 3, 4, StageDevelopment); err != nil {
		t.Fatalf("frontend developer should operate development: %v", err)
	}
	if err := ValidateTransitionOperator(3, 1, 2, 3, 4, StageDevelopment); err != nil {
		t.Fatalf("backend developer should operate development: %v", err)
	}
	if err := ValidateTransitionOperator(4, 1, 2, 3, 4, StageTesting); err != nil {
		t.Fatalf("tester should operate testing: %v", err)
	}
	if err := ValidateTransitionOperator(5, 1, 2, 3, 4, StageDevelopment); err == nil {
		t.Fatal("unassigned user should not operate development")
	}
}

func TestDesignDocumentsAreOptional(t *testing.T) {
	if err := ValidateStageSubmission(StageProductDesign, StageSubmissionInput{}, StatusDevDesign); err != nil {
		t.Fatalf("product document should be optional: %v", err)
	}
	if err := ValidateStageSubmission(StageDevDesign, StageSubmissionInput{}, StatusDevelopment); err != nil {
		t.Fatalf("development design document should be optional: %v", err)
	}
}

func TestDevelopmentSubmissionRequiredFields(t *testing.T) {
	valid := StageSubmissionInput{
		DevSummary:          "done",
		ImplementationNotes: "implemented",
		DeveloperUserID:     2,
	}
	if err := ValidateStageSubmission(StageDevelopment, valid, StatusTesting); err != nil {
		t.Fatalf("valid development submission: %v", err)
	}
	if err := ValidateStageSubmission(StageDevelopment, StageSubmissionInput{}, StatusTesting); err == nil {
		t.Fatal("missing development fields should fail")
	}
}
