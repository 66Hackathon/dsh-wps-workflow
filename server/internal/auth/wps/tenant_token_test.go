package wps

import "testing"

func TestValidWPSUserID(t *testing.T) {
	if ValidWPSUserID("") {
		t.Fatal("empty id should be invalid")
	}
	if ValidWPSUserID("demo-wps-user-001") {
		t.Fatal("demo id should be invalid")
	}
	if !ValidWPSUserID("abc123") {
		t.Fatal("real-looking id should be valid")
	}
}

func TestFilterWPSUserIDs(t *testing.T) {
	got := FilterWPSUserIDs([]string{"u1", "demo-wps-user-002", "u1", "", "u2"})
	if len(got) != 2 || got[0] != "u1" || got[1] != "u2" {
		t.Fatalf("unexpected filtered ids: %#v", got)
	}
}
