package wps

import (
	"net/url"
	"testing"
)

func TestContactSearchQueryEncoding(t *testing.T) {
	query := url.Values{}
	query.Set("keyword", "张三")
	query.Set("page_size", "20")
	query.Add("status", "active")
	query.Add("search_field", "user_name")
	query.Add("search_field", "email")
	query.Add("search_source", "company_user")

	encoded := query.Encode()
	if !containsAll(
		encoded,
		"keyword=",
		"page_size=20",
		"status=active",
		"search_field=user_name",
		"search_field=email",
		"search_source=company_user",
	) {
		t.Fatalf("unexpected query encoding: %s", encoded)
	}
}

func containsAll(s string, parts ...string) bool {
	for _, part := range parts {
		if !stringsContains(s, part) {
			return false
		}
	}
	return true
}

func stringsContains(s, sub string) bool {
	return len(sub) == 0 || (len(s) >= len(sub) && indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
