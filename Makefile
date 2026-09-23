# Developer task runner. Run `make` (or `make help`) to
# list the available targets.

.DEFAULT_GOAL := help

# Canonical environment, loaded for every target.
# A missing .env file is not an error.
ifneq (,$(wildcard .env))
include .env
export
endif

##@ Develop

.PHONY: dev
dev: ## Run the local server, restarting on change; in Casper, lists its URLs in the info panel
	@$(publish_endpoints); \
		exec node --watch server.mjs

.PHONY: app-up
app-up: ## Run the local server (blocking); in Casper, lists its URLs in the info panel
	@$(publish_endpoints); \
		exec node server.mjs

# Shows the game URLs in the Casper info panel. No-op outside Casper, never fails.
define publish_endpoints
if [ -n "$$CASPER_WORKSPACE_ID" ] && command -v casper >/dev/null 2>&1; then \
	port="$(or $(PORT),3000)"; \
	doc="$$(mktemp /tmp/casper-info.XXXXXX)" && mv "$$doc" "$$doc.md" && doc="$$doc.md" && { \
		printf '# Jong\n\n## Endpoints\n\n| Endpoint | URL |\n| --- | --- |\n'; \
		printf '| Local | <http://localhost:%s/> |\n' "$$port"; \
		for ip in $$(node -e "$$LAN_IPS_JS" 2>/dev/null); do \
			printf '| Network (phone) | <http://%s:%s/> |\n' "$$ip" "$$port"; \
		done; \
	} > "$$doc" && casper info set --file "$$doc" >/dev/null 2>&1; \
	rm -f "$$doc"; \
fi; true
endef

# Non-internal IPv4 addresses, listed the same way server.mjs prints its Network URLs.
dev app-up: export LAN_IPS_JS = for (const a of Object.values(require('node:os').networkInterfaces()).flat()) \
	if (a.family === 'IPv4' && !a.internal) console.log(a.address)

##@ Worktree

.PHONY: worktree-init
worktree-init: ## Give this worktree its own port in .env (uses CASPER_PORT; no-op if unset)
	@[ -n "$$CASPER_PORT" ] || exit 0; \
		touch .env; \
		grep -v '^PORT=' .env > .env.tmp || true; \
		echo "PORT=$$CASPER_PORT" >> .env.tmp; \
		mv .env.tmp .env

##@ Quality

.PHONY: test
test: ## Run the test suite
	node --test

.PHONY: check
# The tests import every other module, so they already catch syntax errors there.
check: test ## Run tests and syntax checks
	node --check src/main.js

##@ Container

# Local image name; CI publishes the same image as ghcr.io/alexandreroman/jong.
IMAGE ?= jong

.PHONY: image
image: ## Build the container image (override the name with IMAGE=...)
	docker build -t $(IMAGE) .

.PHONY: image-run
image-run: image ## Build and run the container image on PORT (default 3000)
	docker run --rm -p $(or $(PORT),3000):3000 $(IMAGE)

##@ Helpers

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "Usage: make \033[36m<target>\033[0m\n"} \
		/^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } \
		/^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) }' $(firstword $(MAKEFILE_LIST))
