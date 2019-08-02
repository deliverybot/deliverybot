#!/bin/sh
set -e

curl --silent --show-error --fail ${SECRETS_FILE} | jq -re '.GCLOUD_SERVICE_KEY' > service-key.json
gcloud auth activate-service-account --key-file=./service-key.json
echo $PARAMS > params.json

project=$(jq -r '.project_id' < service-key.json)
service="$(jq -r '.service' < params.json)"

gcloud beta run services delete --project "$project" "$service"
