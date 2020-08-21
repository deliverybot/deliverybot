#!/bin/bash
set -e

./node_modules/.bin/tsc
cp -r ../app/public ./public
./node_modules/.bin/webpack --config config/webpack.config.js

mkdir -p lib/config
mv public/static/bundle/scripts.html lib/config/scripts.html

jq < package.json '.engines.node = "10"' > lib/package.json
