FROM golang:1.22-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/teamspace ./cmd/teamspace

FROM alpine:3.20
RUN adduser -D -g '' app
WORKDIR /app
COPY --from=builder /out/teamspace /app/teamspace
USER app
EXPOSE 8090
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1:8090/healthz || exit 1
ENTRYPOINT ["/app/teamspace"]
