.PHONY: sync lint test infra-up infra-down up down build logs migrate-auth migrate-product migrate-inventory test-inventory-cov

sync:            ## Install/refresh the uv workspace
	uv sync --all-packages

lint:            ## Ruff over the whole workspace
	uv run ruff check libs services

test:            ## Fast unit tests (no containers)
	uv run pytest libs services -m "not integration and not e2e" -q

test-integration:## Integration tests (needs docker for testcontainers)
	uv run pytest libs services -m integration -q

infra-up:        ## Infra only (postgres, redis, ...)
	docker compose -f docker-compose.infra.yml up -d

infra-down:
	docker compose -f docker-compose.infra.yml down

up:              ## Full stack
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f --tail=100

migrate-auth:    ## Run auth migrations against local infra
	cd services/auth_service && uv run alembic upgrade head

migrate-product:
	cd services/product_service && uv run alembic upgrade head

migrate-inventory:
	cd services/inventory_service && uv run alembic upgrade head

test-inventory-cov: ## Coverage report for inventory_service only
	uv run pytest services/inventory_service/tests --cov=inventory_service --cov-report=term-missing -q
