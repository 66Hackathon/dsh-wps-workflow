package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/66hackathon/dsh-wps-workflow/server/internal/auth/session"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/auth/sessionstore"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/auth/wps"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/config"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/handler"
	"github.com/66hackathon/dsh-wps-workflow/server/internal/repository"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	repo, err := repository.NewMySQL(cfg.MySQLDSN())
	if err != nil {
		log.Fatalf("mysql: %v", err)
	}
	defer repo.Close()
	if err := repo.EnsureRequirementDirectionSchema(context.Background()); err != nil {
		log.Fatalf("mysql schema migration: %v", err)
	}

	sessions := session.NewManagerWithStore(&session.RepoStore{
		Repo: sessionstore.MySQL{Repo: repo},
	})
	wpsClient := wps.NewClient(cfg.WPS)
	authHandler := handler.NewAuthHandler(handler.AuthDeps{
		Config:   cfg,
		WPS:      wpsClient,
		Sessions: sessions,
		Repo:     repo,
	})

	router := handler.NewRouter(cfg, repo, authHandler, sessions, wpsClient)
	server := &http.Server{
		Addr:              cfg.Addr(),
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("teamspace listening on %s", cfg.Addr())
		if cfg.OAuthConfigured() {
			log.Printf("wps oauth redirect_uri=%s", cfg.WPS.RedirectURI)
		} else {
			log.Printf("wps oauth not configured; set WPS_OAUTH_* in .env to enable login")
		}
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("listen: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}
