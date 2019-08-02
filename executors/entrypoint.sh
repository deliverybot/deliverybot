#!/bin/bash
set -e

GITHUB_TOKEN=$(curl --silent --show-error --fail ${SECRETS_FILE} | jq -re '.GITHUB_TOKEN')

function status() {
  curl --silent --show-error --fail -XPOST --output /dev/null \
    -H 'content-type: application/json' \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    https://api.github.com/repos/${OWNER}/${REPO}/deployments/${DEPLOYMENT}/statuses \
    -d "{\"state\": \"$1\", \"target_url\": \"$LOGS_URL\", \"environment\": \"$ENVIRONMENT\", \"description\": \"$2\"}"

  curl --silent --show-error --fail -XPOST --output /dev/null \
    -H 'content-type: application/json' \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    https://api.github.com/repos/${OWNER}/${REPO}/statuses/${SHA} \
    -d "{\"state\": \"$1\", \"target_url\": \"$LOGS_URL\", \"environment\": \"$ENVIRONMENT\", \"description\": \"$2\", \"context\": \"deploy/$ENVIRONMENT\"}"
}

echo ""
echo "---------------------------------------"
echo "Running builder \"$BUILDER\" v$VERSION"
echo ""
echo "action:      $ACTION"
echo "owner:       $OWNER"
echo "repo:        $REPO"
echo "commit:      $SHORT_SHA"
echo "logs:        $LOGS_URL"
echo "link:        https://github.com/${OWNER}/${REPO}/commit/${SHORT_SHA}"
echo "environment: $ENVIRONMENT"
echo "deployment:  $DEPLOYMENT"
echo "---------------------------------------"
echo ""
echo ""
echo ""

function fail() {
  status "failure" "Deployment failed"
  exit 1
}

if [ "$ACTION" = "remove" ]; then
  /remove.sh
else
  status "pending" "Beginning deployment"
  /deploy.sh $@ || fail
  status "success" "Deployment successful"
fi
