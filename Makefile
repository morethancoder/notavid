.DEFAULT_GOAL := help

help: ## show this help
	@awk 'BEGIN {FS = ":.*?## "; printf "\n\033[1mUsage:\033[0m make \033[36m<target>\033[0m\n\n\033[1mTargets:\033[0m\n"} \
	     /^[a-z]+:.*?## / {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2} \
	     END {print ""}' $(MAKEFILE_LIST)

doctor: ## check required tools
	@bash scripts/doctor.sh

setup: ## install dependencies
	@bash scripts/doctor.sh
	@npm install

dev: ## run the native app with hot reload
	@npm run tauri dev

web: ## run browser-only dev server (localStorage notes)
	@npm run dev

check: ## type-check frontend and rust backend
	@bash scripts/check.sh

build: ## build the release app bundle (.app/.dmg)
	@npm run tauri build

clean: ## remove rust + frontend build caches (frees several GB)
	@bash scripts/clean.sh

.PHONY: help doctor setup dev web check build clean
