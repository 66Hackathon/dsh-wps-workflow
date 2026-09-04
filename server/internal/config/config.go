package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config holds runtime settings for the TeamSpace API service.
type Config struct {
	Host       string
	Port       int
	DBHost     string
	DBPort     int
	DBUser     string
	DBPassword string
	DBName     string

	WPS     WPSOAuthConfig
	Auth    AuthConfig
	Log     LogConfig
	DevMode bool
}

// LogConfig holds zap logger settings.
type LogConfig struct {
	Level    string // debug / info / warn / error
	Encoding string // json / console
}

// RefreshLeadDuration returns how long before access token expiry to trigger refresh.
func (c Config) RefreshLeadDuration() time.Duration {
	return time.Duration(c.WPS.RefreshLeadSec) * time.Second
}

// WPSOAuthConfig holds WPS Open Platform OAuth 2.0 settings.
type WPSOAuthConfig struct {
	ClientID         string
	ClientSecret     string
	RedirectURI      string
	Scope            string
	AuthURL          string
	TokenURL         string
	UserURL          string
	APIBaseURL       string
	SignatureEnabled bool
	RefreshLeadSec   int
}

// AuthConfig holds session and post-login redirect settings.
type AuthConfig struct {
	SessionSecret       string
	SessionCookieName   string
	SessionCookiePath   string
	FrontendRedirectURL string
	StateCookieName     string
}

// Load reads configuration from environment variables.
// A local .env file is loaded first when present; exported env vars still win.
func Load() (Config, error) {
	_ = godotenv.Load(".env")

	port, err := envInt("TEAMSPACE_PORT", 8090)
	if err != nil {
		return Config{}, err
	}
	dbPort, err := envInt("TEAMSPACE_DB_PORT", 3306)
	if err != nil {
		return Config{}, err
	}

	cfg := Config{
		Host:       envString("TEAMSPACE_HOST", "127.0.0.1"),
		Port:       port,
		DBHost:     envString("TEAMSPACE_DB_HOST", "127.0.0.1"),
		DBPort:     dbPort,
		DBUser:     envString("TEAMSPACE_DB_USER", "teamspace"),
		DBPassword: envString("TEAMSPACE_DB_PASSWORD", "teamspace"),
		DBName:     envString("TEAMSPACE_DB_NAME", "teamspace"),
		WPS: WPSOAuthConfig{
			ClientID:         envString("WPS_OAUTH_CLIENT_ID", ""),
			ClientSecret:     envString("WPS_OAUTH_CLIENT_SECRET", ""),
			RedirectURI:      envString("WPS_OAUTH_REDIRECT_URI", ""),
			Scope:            envString("WPS_OAUTH_SCOPE", "kso.user_base.read kso.file.search"),
			AuthURL:          envString("WPS_OAUTH_AUTH_URL", "https://openapi.wps.cn/oauth2/auth"),
			TokenURL:         envString("WPS_OAUTH_TOKEN_URL", "https://openapi.wps.cn/oauth2/token"),
			UserURL:          envString("WPS_OAUTH_USER_URL", "https://openapi.wps.cn/v7/users/current"),
			APIBaseURL:       envString("WPS_API_BASE_URL", "https://openapi.wps.cn"),
			SignatureEnabled: envBool("WPS_OAUTH_SIGNATURE_ENABLED", true),
			RefreshLeadSec:   envIntDefault("WPS_OAUTH_REFRESH_LEAD_SEC", 300),
		},
		Auth: AuthConfig{
			SessionSecret:       envString("TEAMSPACE_SESSION_SECRET", "change-me-in-production"),
			SessionCookieName:   envString("TEAMSPACE_SESSION_COOKIE", "teamspace_session"),
			SessionCookiePath:   envString("TEAMSPACE_SESSION_COOKIE_PATH", "/api"),
			FrontendRedirectURL: envString("TEAMSPACE_FRONTEND_REDIRECT_URL", "http://127.0.0.1:5173"),
			StateCookieName:     envString("TEAMSPACE_OAUTH_STATE_COOKIE", "teamspace_oauth_state"),
		},
		Log: LogConfig{
			Level:    envString("TEAMSPACE_LOG_LEVEL", "info"),
			Encoding: envString("TEAMSPACE_LOG_ENCODING", ""),
		},
		DevMode: envBool("TEAMSPACE_DEV_MODE", false),
	}
	return cfg, nil
}

// Addr returns the HTTP listen address.
func (c Config) Addr() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

// MySQLDSN returns a MySQL data source name.
func (c Config) MySQLDSN() string {
	return fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?parseTime=true&loc=UTC&charset=utf8mb4&collation=utf8mb4_unicode_ci",
		c.DBUser, c.DBPassword, c.DBHost, c.DBPort, c.DBName)
}

// OAuthConfigured reports whether WPS OAuth login can run.
func (c Config) OAuthConfigured() bool {
	return strings.TrimSpace(c.WPS.ClientID) != "" &&
		strings.TrimSpace(c.WPS.ClientSecret) != "" &&
		strings.TrimSpace(c.WPS.RedirectURI) != ""
}

func envString(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) (int, error) {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer: %w", key, err)
	}
	return value, nil
}

func envIntDefault(key string, fallback int) int {
	value, err := envInt(key, fallback)
	if err != nil {
		return fallback
	}
	return value
}

func envBool(key string, fallback bool) bool {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	switch strings.ToLower(raw) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}
