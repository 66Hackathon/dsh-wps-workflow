package router

import (
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/auth/wps"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/config"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/handler"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/middleware"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/repository"
)

// Deps holds dependencies required to build the HTTP engine.
type Deps struct {
	Config config.Config
	Log    *zap.Logger
	Repo   *repository.Repository
	Auth   *handler.AuthHandler
	WPS    *wps.Client
}

// New builds the Gin engine with middleware and API routes.
func New(deps Deps) *gin.Engine {
	if deps.Config.DevMode {
		gin.SetMode(gin.DebugMode)
	} else {
		gin.SetMode(gin.ReleaseMode)
	}

	engine := gin.New()
	engine.Use(
		middleware.ZapRecovery(deps.Log),
		middleware.ZapAccessLog(deps.Log),
		middleware.CORS(deps.Config),
		deps.Auth.Middleware(),
	)

	handlers := handler.NewHandlers(deps.Repo, deps.Auth, deps.WPS)
	handler.RegisterRoutes(engine, handlers, deps.Config)
	return engine
}
