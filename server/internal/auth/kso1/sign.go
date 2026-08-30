package kso1

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"time"
)

const contentTypeJSON = "application/json"

// Signer computes KSO-1 request signatures for WPS Open Platform APIs.
type Signer struct {
	accessKey string
	secretKey string
}

// NewSigner returns a signer for the given app credentials.
func NewSigner(accessKey, secretKey string) *Signer {
	return &Signer{accessKey: accessKey, secretKey: secretKey}
}

// Headers returns X-Kso-Date and X-Kso-Authorization for an outbound request.
func (s *Signer) Headers(method, requestURI string, body []byte) (ksoDate, authorization string, err error) {
	if s.accessKey == "" || s.secretKey == "" {
		return "", "", fmt.Errorf("kso1: access key and secret key are required")
	}
	ksoDate = time.Now().UTC().Format(time.RFC1123)
	authorization, err = s.AuthorizationAt(method, requestURI, body, ksoDate)
	return ksoDate, authorization, err
}

// AuthorizationAt returns X-Kso-Authorization for a fixed RFC1123 date.
func (s *Signer) AuthorizationAt(method, requestURI string, body []byte, ksoDate string) (string, error) {
	if s.accessKey == "" || s.secretKey == "" {
		return "", fmt.Errorf("kso1: access key and secret key are required")
	}
	signature := s.signature(method, requestURI, contentTypeJSON, ksoDate, body)
	return fmt.Sprintf("KSO-1 %s:%s", s.accessKey, signature), nil
}

func (s *Signer) signature(method, requestURI, contentType, ksoDate string, body []byte) string {
	sha256Hex := ""
	if len(body) > 0 {
		sum := sha256.Sum256(body)
		sha256Hex = hex.EncodeToString(sum[:])
	}
	mac := hmac.New(sha256.New, []byte(s.secretKey))
	_, _ = mac.Write([]byte("KSO-1" + method + requestURI + contentType + ksoDate + sha256Hex))
	return hex.EncodeToString(mac.Sum(nil))
}

// Apply attaches KSO-1 headers to req. requestURI must include the query string.
func (s *Signer) Apply(req *http.Request, body []byte) error {
	ksoDate, authorization, err := s.Headers(req.Method, req.URL.RequestURI(), body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", contentTypeJSON)
	req.Header.Set("X-Kso-Date", ksoDate)
	req.Header.Set("X-Kso-Authorization", authorization)
	return nil
}
