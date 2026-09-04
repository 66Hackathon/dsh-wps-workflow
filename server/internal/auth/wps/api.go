package wps

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const defaultAPIBase = "https://openapi.wps.cn"

// ContactUser is a WPS enterprise user from contacts search.
type ContactUser struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	NickName   string `json:"nick_name"`
	UserName   string `json:"user_name"`
	Email      string `json:"email"`
	Avatar     string `json:"avatar"`
	AvatarURL  string `json:"avatar_url"`
	Department string `json:"department"`
	Status     string `json:"status"`
}

// ChatSummary is a WPS chat session entry.
type ChatSummary struct {
	ID     string `json:"id"`
	Type   string `json:"type"`
	Name   string `json:"name"`
	Status string `json:"status"`
}

// DocumentSummary is a WPS cloud document entry.
type DocumentSummary struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	LinkID   string `json:"link_id"`
	LinkURL  string `json:"link_url"`
	DriveID  string `json:"drive_id"`
	Modified string `json:"modified_time"`
}

type apiEnvelope struct {
	Code int             `json:"code"`
	Msg  string          `json:"msg"`
	Data json.RawMessage `json:"data"`
}

type contactSearchData struct {
	Items         []ContactUser `json:"items"`
	NextPageToken string        `json:"next_page_token"`
}

type chatListData struct {
	Items         []ChatSummary `json:"items"`
	NextPageToken string        `json:"next_page_token"`
}

type chatCreateData struct {
	ID     string `json:"id"`
	Type   string `json:"type"`
	Name   string `json:"name"`
	Status string `json:"status"`
}

type documentSearchData struct {
	Items         []documentSearchHit `json:"items"`
	NextPageToken string              `json:"next_page_token"`
}

// documentSearchHit matches /v7/files/search: each hit wraps a nested file object.
type documentSearchHit struct {
	File *documentFile `json:"file"`
	// Some deployments may flatten fields onto the hit; keep as fallback.
	ID      string    `json:"id"`
	Name    string    `json:"name"`
	Type    string    `json:"type"`
	DriveID string    `json:"drive_id"`
	MTime   any       `json:"mtime"`
	Link    *linkInfo `json:"link"`
	LinkInfo *linkInfo `json:"link_info"`
}

type documentFile struct {
	ID      string    `json:"id"`
	Name    string    `json:"name"`
	Type    string    `json:"type"`
	DriveID string    `json:"drive_id"`
	MTime   any       `json:"mtime"`
	LinkID  string    `json:"link_id"`
	LinkURL string    `json:"link_url"`
	Link    *linkInfo `json:"link"`
	LinkInfo *linkInfo `json:"link_info"`
}

type linkInfo struct {
	ID  string `json:"id"`
	URL string `json:"url"`
}

func (c *Client) apiBase() string {
	if strings.TrimSpace(c.cfg.APIBaseURL) != "" {
		return strings.TrimRight(strings.TrimSpace(c.cfg.APIBaseURL), "/")
	}
	return defaultAPIBase
}

func (c *Client) doJSON(ctx context.Context, method, path, accessToken string, query url.Values, body any) (json.RawMessage, error) {
	if accessToken == "" {
		return nil, fmt.Errorf("wps api: access_token is required")
	}

	reqURL, err := url.Parse(c.apiBase())
	if err != nil {
		return nil, err
	}
	reqURL.Path = path
	if len(query) > 0 {
		reqURL.RawQuery = query.Encode()
	}

	var bodyReader io.Reader
	var signBody []byte
	if body != nil {
		signBody, err = json.Marshal(body)
		if err != nil {
			return nil, err
		}
		bodyReader = bytes.NewReader(signBody)
	}

	req, err := http.NewRequestWithContext(ctx, method, reqURL.String(), bodyReader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("X-Kso-Id-Type", "internal")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	if c.cfg.SignatureEnabled {
		if err := c.signer.Apply(req, signBody); err != nil {
			return nil, err
		}
	} else if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("wps api http %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}

	var envelope apiEnvelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return nil, fmt.Errorf("wps api invalid json: %s", strings.TrimSpace(string(raw)))
	}
	if envelope.Code != 0 {
		if envelope.Msg != "" {
			return nil, fmt.Errorf("wps api failed (code=%d): %s", envelope.Code, envelope.Msg)
		}
		return nil, fmt.Errorf("wps api failed: code %d body=%s", envelope.Code, strings.TrimSpace(string(raw)))
	}
	return envelope.Data, nil
}

func contactDisplayName(user ContactUser) string {
	for _, candidate := range []string{user.UserName, user.NickName, user.Name} {
		if strings.TrimSpace(candidate) != "" {
			return strings.TrimSpace(candidate)
		}
	}
	return user.ID
}

func normalizeContact(user ContactUser) ContactUser {
	user.Name = contactDisplayName(user)
	if user.AvatarURL == "" {
		user.AvatarURL = user.Avatar
	}
	return user
}

// SearchContacts searches enterprise users by keyword.
func (c *Client) SearchContacts(ctx context.Context, accessToken, keyword string, pageSize int) ([]ContactUser, error) {
	keyword = strings.TrimSpace(keyword)
	if keyword == "" {
		return []ContactUser{}, nil
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 50 {
		pageSize = 50
	}

	// 公网搜索必填 search_field；status / search_source / search_field 均为可重复 query。
	query := url.Values{}
	query.Set("keyword", keyword)
	query.Set("page_size", fmt.Sprintf("%d", pageSize))
	query.Add("status", "active")
	query.Add("search_field", "user_name")
	query.Add("search_field", "email")
	query.Add("search_source", "company_user")

	data, err := c.doJSON(ctx, http.MethodGet, "/v7/users/search", accessToken, query, nil)
	if err != nil {
		return nil, err
	}

	var payload contactSearchData
	if len(data) > 0 {
		if err := json.Unmarshal(data, &payload); err != nil {
			return nil, err
		}
	}
	items := make([]ContactUser, 0, len(payload.Items))
	for _, item := range payload.Items {
		items = append(items, normalizeContact(item))
	}
	return items, nil
}

// ListChats returns chats accessible to the current user.
func (c *Client) ListChats(ctx context.Context, accessToken string, pageSize int) ([]ChatSummary, error) {
	if pageSize <= 0 {
		pageSize = 50
	}
	query := url.Values{}
	query.Set("page_size", fmt.Sprintf("%d", pageSize))

	data, err := c.doJSON(ctx, http.MethodGet, "/v7/chats", accessToken, query, nil)
	if err != nil {
		return nil, err
	}

	var payload chatListData
	if len(data) > 0 {
		if err := json.Unmarshal(data, &payload); err != nil {
			return nil, err
		}
	}
	return payload.Items, nil
}

// SearchChats searches chats by keyword.
func (c *Client) SearchChats(ctx context.Context, accessToken, keyword string, pageSize int) ([]ChatSummary, error) {
	keyword = strings.TrimSpace(keyword)
	if keyword == "" {
		return c.ListChats(ctx, accessToken, pageSize)
	}
	if pageSize <= 0 {
		pageSize = 50
	}

	query := url.Values{}
	query.Set("keyword", keyword)
	query.Set("page_size", fmt.Sprintf("%d", pageSize))

	data, err := c.doJSON(ctx, http.MethodGet, "/v7/chats/search", accessToken, query, nil)
	if err != nil {
		return nil, err
	}

	var payload chatListData
	if len(data) > 0 {
		if err := json.Unmarshal(data, &payload); err != nil {
			return nil, err
		}
	}
	return payload.Items, nil
}

type groupMember struct {
	ID   string `json:"id"`
	Type string `json:"type"`
}

// CreateGroupChatInput defines a group chat creation request.
type CreateGroupChatInput struct {
	Name      string
	OwnerID   string
	MemberIDs []string
}

// CreateGroupChat creates a WPS group chat and invites members.
func (c *Client) CreateGroupChat(ctx context.Context, accessToken string, input CreateGroupChatInput) (*ChatSummary, error) {
	name := strings.TrimSpace(input.Name)
	ownerID := strings.TrimSpace(input.OwnerID)
	if name == "" {
		return nil, fmt.Errorf("group name is required")
	}
	if ownerID == "" {
		return nil, fmt.Errorf("owner id is required")
	}

	seen := make(map[string]struct{}, len(input.MemberIDs)+1)
	members := make([]groupMember, 0, len(input.MemberIDs)+1)
	addMember := func(id string) {
		id = strings.TrimSpace(id)
		if id == "" {
			return
		}
		if _, ok := seen[id]; ok {
			return
		}
		seen[id] = struct{}{}
		members = append(members, groupMember{ID: id, Type: "user"})
	}
	addMember(ownerID)
	for _, id := range filterWPSUserIDs(input.MemberIDs) {
		addMember(id)
	}
	if len(members) == 0 {
		return nil, fmt.Errorf("at least one member is required")
	}

	body := map[string]any{
		"type":            "group",
		"name":            name,
		"owner_id":        ownerID,
		"account_id_list": members,
	}

	data, err := c.doJSON(ctx, http.MethodPost, "/v7/chats/create", accessToken, nil, body)
	if err != nil {
		return nil, err
	}

	var payload chatCreateData
	if len(data) > 0 {
		if err := json.Unmarshal(data, &payload); err != nil {
			return nil, err
		}
	}
	if payload.ID == "" {
		return nil, fmt.Errorf("wps create chat failed: empty chat id")
	}
	return &ChatSummary{
		ID:     payload.ID,
		Type:   payload.Type,
		Name:   payload.Name,
		Status: payload.Status,
	}, nil
}

func flattenDocumentHit(hit documentSearchHit) documentFile {
	if hit.File != nil {
		f := *hit.File
		if f.ID == "" {
			f.ID = hit.ID
		}
		if f.Name == "" {
			f.Name = hit.Name
		}
		if f.Type == "" {
			f.Type = hit.Type
		}
		if f.DriveID == "" {
			f.DriveID = hit.DriveID
		}
		if f.MTime == nil {
			f.MTime = hit.MTime
		}
		if f.Link == nil {
			f.Link = hit.Link
		}
		if f.LinkInfo == nil {
			f.LinkInfo = hit.LinkInfo
		}
		return f
	}
	return documentFile{
		ID:       hit.ID,
		Name:     hit.Name,
		Type:     hit.Type,
		DriveID:  hit.DriveID,
		MTime:    hit.MTime,
		Link:     hit.Link,
		LinkInfo: hit.LinkInfo,
	}
}

func documentLink(file documentFile) (linkID, linkURL string) {
	linkID = strings.TrimSpace(file.LinkID)
	linkURL = strings.TrimSpace(file.LinkURL)
	if file.Link != nil {
		if linkID == "" {
			linkID = file.Link.ID
		}
		if linkURL == "" {
			linkURL = file.Link.URL
		}
	}
	if file.LinkInfo != nil {
		if linkID == "" {
			linkID = file.LinkInfo.ID
		}
		if linkURL == "" {
			linkURL = file.LinkInfo.URL
		}
	}
	return linkID, linkURL
}

func formatDocumentTime(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case float64:
		if t <= 0 {
			return ""
		}
		return time.Unix(int64(t), 0).UTC().Format(time.RFC3339)
	case json.Number:
		n, err := t.Int64()
		if err != nil || n <= 0 {
			return ""
		}
		return time.Unix(n, 0).UTC().Format(time.RFC3339)
	default:
		return fmt.Sprintf("%v", t)
	}
}

func isSmartDocument(file documentFile) bool {
	name := strings.ToLower(strings.TrimSpace(file.Name))
	docType := strings.ToLower(strings.TrimSpace(file.Type))
	return strings.HasSuffix(name, ".otl") ||
		docType == "otl" ||
		docType == "airpage" ||
		docType == "smart_doc" ||
		strings.Contains(docType, "otl")
}

// SearchDocuments searches cloud documents. When filterSmartDoc is true, only
// smart-doc-like entries are kept; otherwise all searchable files are returned.
func (c *Client) SearchDocuments(ctx context.Context, accessToken, keyword string, pageSize int, filterSmartDoc bool) ([]DocumentSummary, error) {
	if pageSize <= 0 {
		pageSize = 30
	}

	query := url.Values{}
	query.Set("type", "all")
	query.Set("scope", "personal_drive,latest,share_to_me,group_drive")
	query.Set("page_size", fmt.Sprintf("%d", pageSize))
	query.Set("with_link", "true")
	if strings.TrimSpace(keyword) != "" {
		query.Set("keyword", strings.TrimSpace(keyword))
	}

	data, err := c.doJSON(ctx, http.MethodGet, "/v7/files/search", accessToken, query, nil)
	if err != nil {
		return nil, err
	}

	var payload documentSearchData
	if len(data) > 0 {
		if err := json.Unmarshal(data, &payload); err != nil {
			return nil, err
		}
	}

	items := make([]DocumentSummary, 0, len(payload.Items))
	for _, hit := range payload.Items {
		file := flattenDocumentHit(hit)
		if strings.TrimSpace(file.ID) == "" && strings.TrimSpace(file.Name) == "" {
			continue
		}
		if filterSmartDoc && !isSmartDocument(file) {
			continue
		}
		linkID, linkURL := documentLink(file)
		items = append(items, DocumentSummary{
			ID:       file.ID,
			Name:     file.Name,
			Type:     file.Type,
			LinkID:   linkID,
			LinkURL:  linkURL,
			DriveID:  file.DriveID,
			Modified: formatDocumentTime(file.MTime),
		})
	}
	return items, nil
}
