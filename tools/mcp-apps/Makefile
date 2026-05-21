service := mcp-apps
tag := red
main_image := registry.internal.telnyx.com/jenkins/$(service):$(tag)

.PHONY: install typecheck build test docker-build

install:
	npm ci

typecheck:
	npm run typecheck

build:
	docker build --no-cache -t $(main_image) .

test:
	npm run typecheck
	npm test

docker-build: build
