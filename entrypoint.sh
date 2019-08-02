#!/bin/sh

if [ "$PRIVATE_KEY_BASE64" != "" ]; then
  echo $PRIVATE_KEY_BASE64 | base64 -d > /usr/src/app/lib/cert.pem
  export PRIVATE_KEY_PATH="/usr/src/app/lib/cert.pem"
fi

exec probot run ./lib/index.js
