package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"go.uber.org/zap"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/auth/session"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/auth/sessionstore"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/auth/wps"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/config"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/handler"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/pkg/logger"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/repository"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/router"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic("config: " + err.Error())
	}

	log, err := logger.New(logger.Options{
		Level:       cfg.Log.Level,
		Encoding:    cfg.Log.Encoding,
		Development: cfg.DevMode,
	})
	if err != nil {
		panic("logger: " + err.Error())
	}
	defer func() { _ = log.Sync() }()

	repo, err := repository.NewMySQL(cfg.MySQLDSN())
	if err != nil {
		log.Fatal("mysql connect failed", zap.Error(err))
	}
	defer repo.Close()
	if err := repo.EnsureRequirementDirectionSchema(context.Background()); err != nil {
		log.Fatal("mysql schema migration failed", zap.Error(err))
	}

	sessions := session.NewManagerWithStore(&session.RepoStore{
		Repo: sessionstore.MySQL{Repo: repo},
	})
	wpsClient := wps.NewClient(cfg.WPS)
	authHandler := handler.NewAuthHandler(handler.AuthDeps{
		Config:   cfg,
		Log:      log,
		WPS:      wpsClient,
		Sessions: sessions,
		Repo:     repo,
	})

	engine := router.New(router.Deps{
		Config: cfg,
		Log:    log,
		Repo:   repo,
		Auth:   authHandler,
		WPS:    wpsClient,
	})

	server := &http.Server{
		Addr:              cfg.Addr(),
		Handler:           engine,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Info("teamspace listening", zap.String("addr", cfg.Addr()))
		if cfg.OAuthConfigured() {
			log.Info("wps oauth configured", zap.String("redirect_uri", cfg.WPS.RedirectURI))
		} else {
			log.Warn("wps oauth not configured; set WPS_OAUTH_* in .env to enable login")
		}
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal("listen failed", zap.Error(err))
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		log.Error("shutdown failed", zap.Error(err))
	}
}
