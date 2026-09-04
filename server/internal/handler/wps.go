package handler

import (
	"github.com/gin-gonic/gin"

	"net/http"
	"strings"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/auth/wps"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/repository"
)

// WPSHandler proxies WPS Open Platform APIs.
// 通讯录 / 群聊使用应用 Token（client_id + secret → client_credentials）。
// 云文档搜索使用用户 OAuth Token（授权码换来的 users.wps_access_token），
// 才能访问个人盘 / 分享给我等用户侧范围。
type WPSHandler struct {
	repo *repository.Repository
	auth *AuthHandler
	wps  *wps.Client
}

func NewWPSHandler(repo *repository.Repository, auth *AuthHandler, client *wps.Client) *WPSHandler {
	return &WPSHandler{repo: repo, auth: auth, wps: client}
}

func (h *WPSHandler) tenantAccessToken(c *gin.Context) (string, bool) {
	token, err := h.wps.TenantAccessToken(c.Request.Context())
	if err != nil {
		writeJSON(c, http.StatusBadGateway, map[string]string{
			"error":   "wps_app_token_failed",
			"message": err.Error(),
		})
		return "", false
	}
	return token, true
}

func (h *WPSHandler) accessToken(c *gin.Context) (string, uint64, bool) {
	record, ok := sessionFromContext(c.Request.Context())
	if !ok {
		writeJSON(c, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return "", 0, false
	}
	h.auth.ensureFreshWPSTokens(c.Request.Context(), record.User.ID)
	tokens, err := h.repo.GetUserWPSTokens(c.Request.Context(), record.User.ID)
	if err != nil || tokens.AccessToken == "" {
		writeJSON(c, http.StatusBadRequest, map[string]string{
			"error":   "wps_token_missing",
			"message": "当前账号未绑定 WPS OAuth 凭证，请使用 WPS 登录后再试",
		})
		return "", 0, false
	}
	return tokens.AccessToken, record.User.ID, true
}

func (h *WPSHandler) handleSearchContacts(c *gin.Context) {
	accessToken, ok := h.tenantAccessToken(c)
	if !ok {
		return
	}
	keyword := strings.TrimSpace(c.Query("keyword"))
	items, err := h.wps.SearchContacts(c.Request.Context(), accessToken, keyword, 50)
	if err != nil {
		writeJSON(c, http.StatusBadGateway, map[string]any{
			"error":   "wps_contacts_failed",
			"message": err.Error(),
			"hint":    wpsPermissionHint(err),
		})
		return
	}
	writeJSON(c, http.StatusOK, map[string]any{"items": items})
}

func (h *WPSHandler) handleEnsureContacts(c *gin.Context) {
	if _, ok := sessionFromContext(c.Request.Context()); !ok {
		writeJSON(c, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var body struct {
		Items []struct {
			WPSUserID string `json:"wps_user_id"`
			Name      string `json:"name"`
			NickName  string `json:"nick_name"`
			Email     string `json:"email"`
			AvatarURL string `json:"avatar_url"`
		} `json:"items"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.Items) == 0 {
		writeJSON(c, http.StatusBadRequest, map[string]string{
			"error":   "invalid_json",
			"message": "items is required",
		})
		return
	}

	inputs := make([]repository.WPSContactInput, 0, len(body.Items))
	for _, item := range body.Items {
		inputs = append(inputs, repository.WPSContactInput{
			WPSUserID: item.WPSUserID,
			Name:      item.Name,
			NickName:  item.NickName,
			Email:     item.Email,
			AvatarURL: item.AvatarURL,
		})
	}

	items, err := h.repo.EnsureUsersFromWPSContacts(c.Request.Context(), inputs)
	if err != nil {
		writeJSON(c, http.StatusInternalServerError, map[string]string{
			"error":   "ensure_contacts_failed",
			"message": err.Error(),
		})
		return
	}
	writeJSON(c, http.StatusOK, map[string]any{"items": items})
}

func (h *WPSHandler) handleListChats(c *gin.Context) {
	accessToken, ok := h.tenantAccessToken(c)
	if !ok {
		return
	}
	keyword := strings.TrimSpace(c.Query("keyword"))
	var (
		items []wps.ChatSummary
		err   error
	)
	if keyword != "" {
		items, err = h.wps.SearchChats(c.Request.Context(), accessToken, keyword, 50)
	} else {
		items, err = h.wps.ListChats(c.Request.Context(), accessToken, 50)
	}
	if err != nil {
		writeJSON(c, http.StatusBadGateway, map[string]string{
			"error":   "wps_chats_failed",
			"message": err.Error(),
		})
		return
	}
	if items == nil {
		items = []wps.ChatSummary{}
	}
	writeJSON(c, http.StatusOK, map[string]any{"items": items})
}

func (h *WPSHandler) handleCreateChat(c *gin.Context) {
	accessToken, ok := h.tenantAccessToken(c)
	if !ok {
		return
	}

	record, ok := sessionFromContext(c.Request.Context())
	if !ok {
		writeJSON(c, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	userID := record.User.ID

	var body struct {
		Name            string   `json:"name"`
		OwnerWPSUserID  string   `json:"owner_wps_user_id"`
		MemberWPSUserID []string `json:"member_wps_user_ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		writeJSON(c, http.StatusBadRequest, map[string]string{
			"error":   "invalid_fields",
			"message": "name is required",
		})
		return
	}

	ownerID := strings.TrimSpace(body.OwnerWPSUserID)
	if ownerID == "" {
		user, err := h.repo.GetUserByID(c.Request.Context(), userID)
		if err != nil || !wps.ValidWPSUserID(user.WPSUserID) {
			writeJSON(c, http.StatusBadRequest, map[string]string{
				"error":   "owner_missing",
				"message": "无法确定有效的群主 WPS 用户 ID，请使用 WPS 账号登录",
			})
			return
		}
		ownerID = user.WPSUserID
	}

	chat, err := h.wps.CreateGroupChat(c.Request.Context(), accessToken, wps.CreateGroupChatInput{
		Name:      body.Name,
		OwnerID:   ownerID,
		MemberIDs: body.MemberWPSUserID,
	})
	if err != nil {
		writeJSON(c, http.StatusBadGateway, map[string]string{
			"error":   "wps_create_chat_failed",
			"message": err.Error(),
		})
		return
	}
	writeJSON(c, http.StatusOK, chat)
}

func (h *WPSHandler) handleCreateProjectGroup(c *gin.Context) {
	accessToken, ok := h.tenantAccessToken(c)
	if !ok {
		return
	}

	userID := uint64(0)
	if record, ok := sessionFromContext(c.Request.Context()); ok {
		userID = record.User.ID
	}

	projectID, err := parsePathUint64(c, "id")
	if err != nil {
		writeJSON(c, http.StatusBadRequest, map[string]string{"error": "invalid_id"})
		return
	}

	record, ok := sessionFromContext(c.Request.Context())
	if !ok {
		writeJSON(c, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	canManage, err := h.repo.MemberCanManageProject(c.Request.Context(), projectID, record.User.ID)
	if err != nil {
		writeJSON(c, http.StatusInternalServerError, map[string]string{"error": "check_failed", "message": err.Error()})
		return
	}
	if !canManage {
		writeJSON(c, http.StatusForbidden, map[string]string{"error": "forbidden", "message": "only project manager can manage members"})
		return
	}

	var body struct {
		Name *string `json:"name"`
	}
	_ = c.ShouldBindJSON(&body)

	project, err := h.repo.GetProject(c.Request.Context(), projectID)
	if err != nil {
		writeJSON(c, http.StatusNotFound, map[string]string{"error": "project_not_found"})
		return
	}

	groupName := strings.TrimSpace(project.Name) + " 项目群"
	if body.Name != nil && strings.TrimSpace(*body.Name) != "" {
		groupName = strings.TrimSpace(*body.Name)
	}

	owner, err := h.repo.GetUserByID(c.Request.Context(), userID)
	if err != nil || !wps.ValidWPSUserID(owner.WPSUserID) {
		writeJSON(c, http.StatusBadRequest, map[string]string{
			"error":   "owner_missing",
			"message": "当前用户缺少有效的 WPS 用户 ID，请使用 WPS 企业账号登录后再创建群聊（演示账号不支持）",
		})
		return
	}

	memberIDs, err := h.repo.ListProjectMemberWPSUserIDs(c.Request.Context(), projectID)
	if err != nil {
		writeJSON(c, http.StatusInternalServerError, map[string]string{
			"error":   "list_members_failed",
			"message": err.Error(),
		})
		return
	}
	memberIDs = wps.FilterWPSUserIDs(memberIDs)

	chat, err := h.wps.CreateGroupChat(c.Request.Context(), accessToken, wps.CreateGroupChatInput{
		Name:      groupName,
		OwnerID:   owner.WPSUserID,
		MemberIDs: memberIDs,
	})
	if err != nil {
		writeJSON(c, http.StatusBadGateway, map[string]string{
			"error":   "wps_create_chat_failed",
			"message": err.Error(),
		})
		return
	}

	updated, err := h.repo.UpdateProjectSetup(c.Request.Context(), projectID, repository.UpdateProjectSetupInput{
		WPSGroupID:   &chat.ID,
		WPSGroupName: &chat.Name,
	})
	if err != nil {
		writeJSON(c, http.StatusInternalServerError, map[string]string{
			"error":   "update_project_failed",
			"message": err.Error(),
		})
		return
	}
	writeJSON(c, http.StatusOK, map[string]any{
		"chat":    chat,
		"project": updated,
	})
}

func (h *WPSHandler) handleSearchDocuments(c *gin.Context) {
	accessToken, _, ok := h.accessToken(c)
	if !ok {
		return
	}
	keyword := strings.TrimSpace(c.Query("keyword"))
	// Default: return all searchable docs. Pass smart_only=true to keep .otl / 智能文档 only.
	smartOnly := strings.ToLower(strings.TrimSpace(c.Query("smart_only"))) == "true"
	items, err := h.wps.SearchDocuments(c.Request.Context(), accessToken, keyword, 30, smartOnly)
	if err != nil {
		writeJSON(c, http.StatusBadGateway, map[string]any{
			"error":   "wps_documents_failed",
			"message": err.Error(),
			"hint":    wpsDocumentsPermissionHint(err),
		})
		return
	}
	if items == nil {
		items = []wps.DocumentSummary{}
	}
	writeJSON(c, http.StatusOK, map[string]any{"items": items})
}

func wpsPermissionHint(err error) string {
	if err == nil {
		return ""
	}
	msg := err.Error()
	if !strings.Contains(msg, "403") && !strings.Contains(msg, "PermissionDenied") && !strings.Contains(msg, "invalid_scope") {
		return ""
	}
	return "请在 WPS 开发者后台 → 权限申请 中为应用开通对应「应用授权」权限（如 kso.contact.read、kso.chat.readwrite），并配置数据权限范围。此类权限与 WPS_OAUTH_SCOPE 无关，无需重新登录。"
}

func wpsDocumentsPermissionHint(err error) string {
	if err == nil {
		return ""
	}
	msg := err.Error()
	if !strings.Contains(msg, "403") && !strings.Contains(msg, "PermissionDenied") && !strings.Contains(msg, "invalid_scope") {
		return ""
	}
	return "云文档搜索使用用户 OAuth Token。请在开发者后台开通「用户授权」kso.file.search，把 WPS_OAUTH_SCOPE 加上 kso.file.search 后重新 WPS 登录授权。"
}
