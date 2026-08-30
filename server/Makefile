APP_NAME := teamspace
BIN := bin/$(APP_NAME)
MAIN := ./cmd/teamspace
MYSQL_CONTAINER := dsh-wps-workflow-server-mysql-1

.PHONY: run build tidy docker-up docker-down docker-logs mysql-only mysql-init clean

run: build
	./$(BIN)

build:
	@mkdir -p bin
	go build -o $(BIN) $(MAIN)

tidy:
	go mod tidy

docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f mysql

mysql-only: docker-up

mysql-init:
	docker compose exec -T mysql sh -c 'mysql -uroot -p"$$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 < /docker-entrypoint-initdb.d/schema.sql'

clean:
	rm -rf bin/
