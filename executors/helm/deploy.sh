#!/bin/bash
set -e
curl --silent --show-error --fail ${SECRETS_FILE} | jq -re '.KUBECONFIG' > ./kubeconfig
export KUBECONFIG="$PWD/kubeconfig"

echo $PARAMS > params.json

namespace="$(jq -Mr '.namespace' < params.json)"
release="$(jq -Mr '.release' < params.json)"
chart="$(jq -Mr '.chart' < params.json)"

if [ "$namespace" = "null" ]; then
  echo "'namespace' must be set in exec.params"
  exit 1
fi
if [ "$release" = "null" ]; then
  echo "'release' must be set in exec.params"
  exit 1
fi
if [ "$chart" = "null" ]; then
  chart="/deliverybot-default-0.1.0.tgz"
fi

helm init --client-only
helm upgrade "$release" "$chart"  \
  --install --wait \
  --namespace "$namespace" \
  --values ./params.json
