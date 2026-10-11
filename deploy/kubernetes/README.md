# Kubernetes deployment

Deliverybot runs as two Deployments in its own namespace: `web` serves the
dashboard and receives webhooks, and `worker` processes the job queue. Both
use the image built from the repository's `Dockerfile`. Postgres runs in the
same namespace through the [CloudNativePG](https://cloudnative-pg.io)
operator.

```
base/                 shared manifests
overlays/staging/     namespace deliverybot-staging, staging.deliverybot.dev
overlays/production/  namespace deliverybot-production, app.deliverybot.dev,
                      2 web pods, a Postgres replica
```

Deliverybot deploys itself. The `Deploy` workflow
(`.github/workflows/deploy.yml`) builds an image for every push to `master` and
pushes it to `ghcr.io/deliverybot/deliverybot`. Deliverybot, configured in
`.github/deploy.yml`, then creates GitHub deployments: staging automatically
once CI and the image build pass, production when someone deploys it from the
dashboard. Each deployment runs the workflow's deploy job, which applies the
overlay and reports the result as deployment statuses.

### Break glass

A bad deploy can take Deliverybot down, and then it can't deploy the fix. The
same workflow can always be run by hand: Actions, Deploy, Run workflow, pick
the environment, and optionally a commit SHA, tag or branch under "ref" to roll
back to. This path doesn't need the app. It still records a GitHub deployment
(marked `break_glass` in its payload), so the environment's history stays
complete.

Install only one Deliverybot GitHub App (normally production) on this
repository. Each installed app creates its own deployments.

## One-time cluster setup

The manifests expect these to be installed in the cluster already:

- The CloudNativePG operator, for example with its Helm chart:
  `helm install cnpg cloudnative-pg --repo https://cloudnative-pg.github.io/charts --namespace cnpg-system --create-namespace`
- A Gateway API gateway named `public` in the `gateway` namespace, with an
  HTTPS listener `https-deliverybot-dev-wildcard` for `*.deliverybot.dev` that
  accepts routes from other namespaces. To use a different gateway, change
  the `parentRefs` in `base/route.yaml`.

Point DNS for `staging.deliverybot.dev` and `app.deliverybot.dev` at the
gateway's load balancer.

## GitHub setup

Create two environments under the repository's Settings, Environments:
`staging` and `production`. Give each one:

- Variable `DO_CLUSTER`: the name of the DigitalOcean Kubernetes cluster.
- Secret `DIGITALOCEAN_ACCESS_TOKEN`: a DigitalOcean API token that can read
  the cluster's credentials.
- Secrets for the GitHub App that environment uses: `APP_ID`, `PRIVATE_KEY`,
  `WEBHOOK_SECRET`, `CLIENT_ID`, `CLIENT_SECRET`, and `SESSION_SECRET` (any
  long random string).
- Optional Slack secrets: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`,
  `SLACK_LOGIN_URL`.

Then add the repository variable `DEPLOY_ENABLED` with the value `true`
(Settings, Secrets and variables, Actions, Variables). The workflow does
nothing until it is set.

The workflow copies these secrets into a `deliverybot` Secret in the namespace
on every deploy. After the first run, make the
`ghcr.io/deliverybot/deliverybot` package public (its package settings) so the
cluster can pull the image without credentials. Set the GitHub App's webhook URL to
`https://<host>/api/github/webhooks` and its callback URL to
`https://<host>/login/cb`.

## Database

CloudNativePG creates the `deliverybot` database and a `deliverybot-db-app`
Secret holding its connection string. Each `web` pod runs migrations in an
init container before it starts. Migrations take a Postgres advisory lock, so
pods starting together don't conflict.

Backups are not configured yet. Add a `backup` section to `base/database.yaml`
once there is a DigitalOcean Spaces bucket for them.

## Trying it locally

```sh
kind create cluster
kubectl apply --server-side -f <CloudNativePG operator manifest>
docker build -t deliverybot:dev .
kind load docker-image deliverybot:dev
kubectl kustomize deploy/kubernetes/overlays/staging   # renders the manifests
```
