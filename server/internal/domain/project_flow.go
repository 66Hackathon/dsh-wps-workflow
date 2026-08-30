package domain

import "fmt"

// Project setup steps (UI workflow; WPS steps optional).
const (
	ProjectStepCreateProject = "CREATE_PROJECT"
	ProjectStepAddMembers    = "ADD_MEMBERS"
	ProjectStepCreateGroup   = "CREATE_WPS_GROUP"
)

// ProjectSetupStep describes a project onboarding step.
type ProjectSetupStep struct {
	StepCode    string
	Title       string
	Required    bool
	WPSRelated  bool
	Description string
}

// ProjectSetupSteps defines the project creation flow.
var ProjectSetupSteps = []ProjectSetupStep{
	{
		StepCode:    ProjectStepCreateProject,
		Title:       "创建项目",
		Required:    true,
		WPSRelated:  false,
		Description: "项目名称、编码、描述、负责人须真实填写",
	},
	{
		StepCode:    ProjectStepAddMembers,
		Title:       "添加成员",
		Required:    true,
		WPSRelated:  false,
		Description: "从系统用户选择成员并分配角色（非 WPS 通讯录）",
	},
	{
		StepCode:    ProjectStepCreateGroup,
		Title:       "创建项目群",
		Required:    false,
		WPSRelated:  true,
		Description: "WPS IM 群聊（Demo 未开放，可不填 wps_group_id）",
	},
}

// ValidateProjectCreate ensures core project fields are filled (non-WPS).
func ValidateProjectCreate(code, name, description string, ownerUserID uint64) error {
	if ownerUserID == 0 {
		return fmt.Errorf("owner_user_id is required")
	}
	if len(code) < 2 {
		return fmt.Errorf("project_code is required")
	}
	if len(name) < 2 {
		return fmt.Errorf("name is required")
	}
	if len(description) < 10 {
		return fmt.Errorf("description must be at least 10 characters")
	}
	return nil
}
