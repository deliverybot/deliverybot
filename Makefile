release:
	standard-version
	git push --follow-tags origin master
	npm publish
.PHONY: release

pre-release:
	standard-version --prerelease
	git push --follow-tags origin master
	npm publish
.PHONY: pre-release
