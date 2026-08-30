package domain

import (
	"fmt"
	"slices"
)

// UI role codes stored in project_members.role_codes JSON.
const (
	UIRoleProjectAdmin = "PROJECT_ADMIN"
	UIRoleMember       = "MEMBER"
)

// ValidUIRoles lists assignable member role tags in the UI.
var ValidUIRoles = []string{
	UIRoleProjectAdmin,
	UIRoleMember,
}

// CreatorUIRoles is applied to the project creator (manager only).
var CreatorUIRoles = []string{UIRoleProjectAdmin}

// AssignableUIRoles for manually added members.
var AssignableUIRoles = []string{UIRoleMember}

// Legacy single role_code values (kept for compatibility queries).
var ValidProjectRoles = []string{
	"PROJECT_ADMIN",
	"PRODUCT_OWNER",
	"DEVELOPER",
	"TESTER",
	"MEMBER",
}

// ValidateUIRoles ensures each role is allowed and at least one is present.
func ValidateUIRoles(roleCodes []string, isCreator bool) error {
	if len(roleCodes) == 0 {
		return fmt.Errorf("请至少选择一个项目角色")
	}
	for _, code := range roleCodes {
		if !slices.Contains(ValidUIRoles, code) {
			return fmt.Errorf("invalid role_code: %s", code)
		}
		if !isCreator && code == UIRoleProjectAdmin {
			return fmt.Errorf("项目管理员角色仅适用于创建者")
		}
	}
	if isCreator {
		for _, code := range roleCodes {
			if code != UIRoleProjectAdmin {
				return fmt.Errorf("创建者仅保留项目管理员角色")
			}
		}
	}
	return nil
}

// ValidateAddProjectMember validates input for adding a member.
func ValidateAddProjectMember(userID uint64, roleCodes []string) error {
	if userID == 0 {
		return fmt.Errorf("user_id is required")
	}
	if len(roleCodes) == 0 {
		roleCodes = []string{UIRoleMember}
	}
	return ValidateUIRoles(roleCodes, false)
}

// PrimaryRoleCode derives legacy role_code from UI role tags.
func PrimaryRoleCode(roleCodes []string) string {
	if len(roleCodes) == 0 {
		return "MEMBER"
	}
	if slices.Contains(roleCodes, UIRoleProjectAdmin) {
		return "PROJECT_ADMIN"
	}
	return "MEMBER"
}

// ValidateProjectRole ensures legacy role_code is allowed.
func ValidateProjectRole(roleCode string) error {
	if roleCode == "" {
		return fmt.Errorf("role_code is required")
	}
	if !slices.Contains(ValidProjectRoles, roleCode) {
		return fmt.Errorf("invalid role_code: %s", roleCode)
	}
	return nil
}
