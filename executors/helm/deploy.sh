#!/bin/bash
set -e
curl --silent --show-error --fail ${SECRETS_FILE} | jq -re '.KUBECONFIG' > ./kubeconfig
export KUBECONFIG="$PWD/kubeconfig"

echo $PARAMS > params.json

namespace="$(jq '.namespace' < params.json)"
release="$(jq '.release' < params.json)"
chart="$(jq '.chart' < params.json)"

if [ "$namespace" = "" ]; then
  echo "'namespace' must be set in exec.params"
  exit 1
fi
if [ "$release" = "" ]; then
  echo "'release' must be set in exec.params"
  exit 1
fi
if [ "$chart" = "" ]; then
  chart="/charts/default"
fi

helm init --client-only
helm upgrade "$release" "$chart"  \
  --install --wait \
  --namespace "$namespace" \
  --values ./params.json
