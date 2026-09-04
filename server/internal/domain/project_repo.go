package domain

import (
	"fmt"
	"strings"
)

// 研发方向（项目仓库绑定）：仅前端 / 后端 / 移动端
const (
	DevDirectionFrontend = "FRONTEND"
	DevDirectionBackend  = "BACKEND"
	DevDirectionMobile   = "MOBILE"
)

// DevDirectionLabels maps direction code to display label.
var DevDirectionLabels = map[string]string{
	DevDirectionFrontend: "前端",
	DevDirectionBackend:  "后端",
	DevDirectionMobile:   "移动端",
}

// AllowedDevDirections lists valid dev direction values.
var AllowedDevDirections = []string{
	DevDirectionFrontend,
	DevDirectionBackend,
	DevDirectionMobile,
}

// ValidateDevDirection ensures direction is one of the allowed values.
func ValidateDevDirection(direction string) error {
	code := strings.ToUpper(strings.TrimSpace(direction))
	if _, ok := DevDirectionLabels[code]; !ok {
		return fmt.Errorf("dev_direction must be one of: %s", strings.Join(AllowedDevDirections, ", "))
	}
	return nil
}

// ValidateProjectRepositoryInput validates a project repository row.
func ValidateProjectRepositoryInput(repoURL, defaultBranch, devDirection string) error {
	if strings.TrimSpace(repoURL) == "" {
		return fmt.Errorf("repo_url is required")
	}
	if strings.TrimSpace(defaultBranch) == "" {
		return fmt.Errorf("default_branch is required")
	}
	return ValidateDevDirection(devDirection)
}
