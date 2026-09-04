package domain

import (
	"fmt"
	"slices"
)

// project_members has no role column: the project administrator is
// projects.owner_user_id and everybody else is a plain member. The UI role
// codes below are still synthesized in API responses for client compatibility.
const (
	UIRoleProjectAdmin = "PROJECT_ADMIN"
	UIRoleMember       = "MEMBER"
)

// ValidUIRoles lists the synthesized member role tags exposed to the UI.
var ValidUIRoles = []string{
	UIRoleProjectAdmin,
	UIRoleMember,
}

// CreatorUIRoles is reported for the project owner.
var CreatorUIRoles = []string{UIRoleProjectAdmin}

// AssignableUIRoles is reported for every other member.
var AssignableUIRoles = []string{UIRoleMember}

// MemberCanManage reports whether a user may manage the project
// (members, repositories, settings). Only the project owner can.
func MemberCanManage(ownerUserID, userID uint64) bool {
	return ownerUserID != 0 && ownerUserID == userID
}

// SynthesizeRoleCodes derives the UI role tags for a member from project ownership.
func SynthesizeRoleCodes(ownerUserID, userID uint64) []string {
	if MemberCanManage(ownerUserID, userID) {
		return append([]string(nil), CreatorUIRoles...)
	}
	return append([]string(nil), AssignableUIRoles...)
}

// ValidateUIRoles ensures each role is allowed and at least one is present.
// Roles are not persisted; this only guards legacy request payloads.
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

// ValidateAddProjectMember validates input for adding a member. Role codes are
// accepted for backwards compatibility but never persisted.
func ValidateAddProjectMember(userID uint64, roleCodes []string) error {
	if userID == 0 {
		return fmt.Errorf("user_id is required")
	}
	if len(roleCodes) == 0 {
		return nil
	}
	return ValidateUIRoles(roleCodes, false)
}

// PrimaryRoleCode derives the legacy single role_code from UI role tags.
func PrimaryRoleCode(roleCodes []string) string {
	if slices.Contains(roleCodes, UIRoleProjectAdmin) {
		return UIRoleProjectAdmin
	}
	return UIRoleMember
}
