#!/bin/bash
set -e
curl --silent --show-error --fail ${SECRETS_FILE} | jq -re '.KUBECONFIG' > ./kubeconfig
export KUBECONFIG="$PWD/kubeconfig"

echo $PARAMS > params.json

release="$(jq '.release' < params.json)"
if [ "$release" = "" ]; then
  echo "'release' must be set in exec.params"
  exit 1
fi

helm init
helm delete "$release" --purge
