package kso1_test

import (
	"testing"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/auth/kso1"
)

func TestSignerAuthorizationMatchesOfficialExample(t *testing.T) {
	signer := kso1.NewSigner("AK123456", "sk098765")
	ksoDate := "Mon, 02 Jan 2006 15:04:05 GMT"
	authorization, err := signer.AuthorizationAt("GET", "/v7/test?key=value", nil, ksoDate)
	if err != nil {
		t.Fatalf("AuthorizationAt: %v", err)
	}
	want := "KSO-1 AK123456:ce8df66877175e5198c8ea1362ffddf82e4941c6f25a4ca205a1ad09d0faaf03"
	if authorization != want {
		t.Fatalf("authorization = %q, want %q", authorization, want)
	}
}
