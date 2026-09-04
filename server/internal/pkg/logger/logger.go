package logger

import (
	"fmt"
	"os"
	"strings"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// Options controls zap logger initialization.
type Options struct {
	Level       string // debug / info / warn / error
	Development bool
	Encoding    string // json / console
}

// New builds a production-ready zap logger.
func New(opts Options) (*zap.Logger, error) {
	level := zapcore.InfoLevel
	switch strings.ToLower(strings.TrimSpace(opts.Level)) {
	case "debug":
		level = zapcore.DebugLevel
	case "warn", "warning":
		level = zapcore.WarnLevel
	case "error":
		level = zapcore.ErrorLevel
	case "info", "":
		level = zapcore.InfoLevel
	default:
		return nil, fmt.Errorf("unsupported log level %q", opts.Level)
	}

	encoding := strings.ToLower(strings.TrimSpace(opts.Encoding))
	if encoding == "" {
		if opts.Development {
			encoding = "console"
		} else {
			encoding = "json"
		}
	}
	if encoding != "json" && encoding != "console" {
		return nil, fmt.Errorf("unsupported log encoding %q", opts.Encoding)
	}

	encoderCfg := zap.NewProductionEncoderConfig()
	encoderCfg.TimeKey = "ts"
	encoderCfg.EncodeTime = zapcore.ISO8601TimeEncoder
	encoderCfg.EncodeDuration = zapcore.MillisDurationEncoder
	if encoding == "console" {
		encoderCfg = zap.NewDevelopmentEncoderConfig()
		encoderCfg.EncodeLevel = zapcore.CapitalColorLevelEncoder
		encoderCfg.EncodeTime = zapcore.TimeEncoderOfLayout("15:04:05.000")
	}

	var encoder zapcore.Encoder
	if encoding == "console" {
		encoder = zapcore.NewConsoleEncoder(encoderCfg)
	} else {
		encoder = zapcore.NewJSONEncoder(encoderCfg)
	}

	core := zapcore.NewCore(encoder, zapcore.AddSync(os.Stdout), level)
	optsZap := []zap.Option{zap.AddCaller()}
	if opts.Development {
		optsZap = append(optsZap, zap.Development())
	}
	return zap.New(core, optsZap...), nil
}
