#!/bin/bash

./node_modules/.bin/standard-version --skip.commit $@
node ./scripts/bump-versions.js

version=$(jq -r '.version' < ./package.json)

git add .
git commit -m "chore: release v${version}"
git tag "v${version}"
git push --follow-tags origin master
