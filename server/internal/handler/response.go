package handler

import (
	"github.com/gin-gonic/gin"
)

func writeJSON(c *gin.Context, status int, payload any) {
	c.JSON(status, payload)
}
