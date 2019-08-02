#!/bin/sh
set -e

curl --silent --show-error --fail ${SECRETS_FILE} | jq -re '.GCLOUD_SERVICE_KEY' > service-key.json
gcloud auth activate-service-account --key-file=./service-key.json
echo $PARAMS > params.json

project=$(jq -r '.project_id' < service-key.json)
service="$(jq -r '.service' < params.json)"
platform="$(jq -r '.platform' < params.json)"
region="$(jq -r '.region' < params.json)"
image_repo="$(jq -r '.image.repository' < params.json)"
image_tag="$(jq -r '.image.tag' < params.json)"

gcloud beta run deploy "$service" \
  --project "$project" \
  --allow-unauthenticated \
  --platform "${platform:-managed}" \
  --region "${region:-us-central1}" \
  --image "${image_repo}:${image_tag}"
