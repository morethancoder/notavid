.DEFAULT_GOAL := help

help: ## show this help
	@awk 'BEGIN {FS = ":.*?## "; printf "\n\033[1mUsage:\033[0m make \033[36m<target>\033[0m\n\n\033[1mTargets:\033[0m\n"} \
	     /^[a-z]+:.*?## / {printf "  \033[36m%-11s\033[0m %s\n", $$1, $$2} \
	     END {print ""}' $(MAKEFILE_LIST)

doctor: ## check required tools
	@bash scripts/doctor.sh

setup: ## install dependencies
	@bash scripts/doctor.sh
	@npm install
	@cd extension && npm install

dev: ## run the native app with hot reload
	@npm run tauri dev

web: ## run browser-only dev server (localStorage notes)
	@npm run dev

check: ## type-check frontend and rust backend
	@bash scripts/check.sh

build: ## build the release app bundle (.app/.dmg)
	@npm run tauri build

ext: ## build the chrome extension into extension/.output/chrome-mv3
	@bash scripts/ext.sh build

extinstall: ## build the extension and walk you through loading it into chrome
	@bash scripts/ext.sh install

extdev: ## open chrome with the extension on youtube, rebuilding as you edit
	@bash scripts/ext.sh dev

exttest: ## end-to-end test the extension on live youtube (headless)
	@bash scripts/ext.sh test

extzip: ## zip the extension for the chrome web store
	@bash scripts/ext.sh zip

clean: ## remove rust + frontend build caches (frees several GB)
	@bash scripts/clean.sh

.PHONY: help doctor setup dev web check build ext extinstall extdev exttest extzip clean
