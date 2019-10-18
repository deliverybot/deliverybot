build:
	./node_modules/.bin/tsc -p tsconfig.json
	node src/partials.js > static/partials.js
.PHONY: build

test:
	./node_modules/.bin/jest
.PHONY: test

release:
	standard-version
	git push --follow-tags origin master
	npm publish
.PHONY: release
