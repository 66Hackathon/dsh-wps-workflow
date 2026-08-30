package domain

import "testing"

func TestValidateUIRolesCreator(t *testing.T) {
	if err := ValidateUIRoles(CreatorUIRoles, true); err != nil {
		t.Fatalf("creator roles: %v", err)
	}
	if err := ValidateUIRoles([]string{UIRoleMember}, true); err == nil {
		t.Fatal("creator should not take member role")
	}
}

func TestValidateUIRolesMember(t *testing.T) {
	if err := ValidateAddProjectMember(2, []string{UIRoleMember}); err != nil {
		t.Fatalf("member role: %v", err)
	}
	if err := ValidateAddProjectMember(2, nil); err != nil {
		t.Fatalf("default member role: %v", err)
	}
}

func TestPrimaryRoleCode(t *testing.T) {
	if got := PrimaryRoleCode([]string{UIRoleProjectAdmin}); got != "PROJECT_ADMIN" {
		t.Fatalf("expected PROJECT_ADMIN, got %s", got)
	}
	if got := PrimaryRoleCode([]string{UIRoleMember}); got != "MEMBER" {
		t.Fatalf("expected MEMBER, got %s", got)
	}
}
