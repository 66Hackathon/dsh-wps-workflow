package domain

import (
	"fmt"
	"strings"
)

// 仓库类型 / 研发方向（project_repositories.repository_type、requirements.development_type）
const (
	DevDirectionFrontend = "FRONTEND"
	DevDirectionBackend  = "BACKEND"
	DevDirectionMobile   = "MOBILE"
)

// Aliases used when talking about project_repositories.repository_type.
const (
	RepositoryTypeFrontend = DevDirectionFrontend
	RepositoryTypeBackend  = DevDirectionBackend
	RepositoryTypeMobile   = DevDirectionMobile
)

// DevDirectionLabels maps a repository type / development type to its label.
var DevDirectionLabels = map[string]string{
	DevDirectionFrontend: "前端",
	DevDirectionBackend:  "后端",
	DevDirectionMobile:   "移动端",
}

// AllowedDevDirections lists valid repository / development types.
var AllowedDevDirections = []string{
	DevDirectionFrontend,
	DevDirectionBackend,
	DevDirectionMobile,
}

// ValidateRepositoryType ensures repository_type is one of the allowed values.
func ValidateRepositoryType(repositoryType string) error {
	code := strings.ToUpper(strings.TrimSpace(repositoryType))
	if _, ok := DevDirectionLabels[code]; !ok {
		return fmt.Errorf("repository_type must be one of: %s", strings.Join(AllowedDevDirections, ", "))
	}
	return nil
}

// ValidateProjectRepositoryInput validates a project_repositories row.
func ValidateProjectRepositoryInput(repositoryURL, defaultBranch, repositoryType string) error {
	if strings.TrimSpace(repositoryURL) == "" {
		return fmt.Errorf("repository_url is required")
	}
	if strings.TrimSpace(defaultBranch) == "" {
		return fmt.Errorf("default_branch is required")
	}
	return ValidateRepositoryType(repositoryType)
}

// NormalizeGitURL renders a remote URL in a canonical form so the same
// repository configured as SSH or HTTPS matches a local Git remote.
//
//	git@github.com:acme/web.git  → https://github.com/acme/web
//	ssh://git@host:22/acme/web/  → https://host/acme/web
//	HTTPS://Host/Acme/Web.git    → https://host/Acme/Web
func NormalizeGitURL(raw string) string {
	url := strings.TrimSpace(raw)
	if url == "" {
		return ""
	}

	// scp-like syntax: git@host:path
	if !strings.Contains(url, "://") {
		if at := strings.Index(url, "@"); at >= 0 {
			if colon := strings.Index(url[at:], ":"); colon >= 0 {
				host := url[at+1 : at+colon]
				path := url[at+colon+1:]
				url = "https://" + host + "/" + strings.TrimPrefix(path, "/")
			}
		}
	}

	if idx := strings.Index(url, "://"); idx >= 0 {
		url = url[idx+len("://"):]
	}
	// Drop any userinfo (git@, oauth2:token@ ...).
	if at := strings.LastIndex(url, "@"); at >= 0 {
		url = url[at+1:]
	}

	host := url
	path := ""
	if slash := strings.Index(url, "/"); slash >= 0 {
		host = url[:slash]
		path = url[slash+1:]
	}
	// Drop an explicit port; the canonical form is always https.
	if colon := strings.Index(host, ":"); colon >= 0 {
		host = host[:colon]
	}
	host = strings.ToLower(host)

	path = strings.Trim(path, "/")
	path = strings.TrimSuffix(path, ".git")
	if path == "" {
		return "https://" + host
	}
	return "https://" + host + "/" + path
}
