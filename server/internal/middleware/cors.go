package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/config"
)

// CORS applies browser cross-origin headers for the TeamSpace frontend.
func CORS(cfg config.Config) gin.HandlerFunc {
	allowedOrigin := strings.TrimRight(cfg.Auth.FrontendRedirectURL, "/")
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" && corsOriginAllowed(origin, allowedOrigin, cfg.DevMode) {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Credentials", "true")
			c.Header("Vary", "Origin")
		}
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func corsOriginAllowed(origin, allowedOrigin string, devMode bool) bool {
	if allowedOrigin == "" || origin == allowedOrigin {
		return true
	}
	if !devMode {
		return false
	}
	return strings.HasPrefix(origin, "http://127.0.0.1:") ||
		strings.HasPrefix(origin, "http://localhost:") ||
		strings.HasPrefix(origin, "http://0.0.0.0:") ||
		strings.HasPrefix(origin, "http://10.") ||
		strings.HasPrefix(origin, "http://192.168.") ||
		strings.HasPrefix(origin, "http://172.")
}
