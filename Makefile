.PHONY: sync lint test test-integration test-e2e infra-up infra-down up down logs migrate-auth migrate-product migrate-inventory test-inventory-cov

sync:            ## Install/refresh the uv workspace
	uv --directory python sync --all-packages

lint:            ## Ruff over the whole workspace
	uv --directory python run ruff check libs services

test:            ## Fast unit tests (no containers)
	uv --directory python run pytest libs services -m "not integration and not e2e" -q

test-integration:## Integration tests (needs docker for testcontainers)
	uv --directory python run pytest libs services -m integration -q

test-e2e:        ## E2E tests (needs the full docker compose stack running)
	uv --directory python run pytest libs services -m e2e -q

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
	cd python/services/auth_service && uv run alembic upgrade head

migrate-product:
	cd python/services/product_service && uv run alembic upgrade head

migrate-inventory:
	cd python/services/inventory_service && uv run alembic upgrade head

test-inventory-cov: ## Coverage report for inventory_service only
	uv --directory python run pytest services/inventory_service/tests --cov=inventory_service --cov-report=term-missing -q
