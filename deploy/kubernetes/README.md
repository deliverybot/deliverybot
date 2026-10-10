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

The `Deploy` workflow (`.github/workflows/deploy.yml`) builds the image, pushes
it to `ghcr.io/deliverybot/deliverybot`, and applies an overlay. Every push to
`master` deploys to staging. Production is deployed by hand: Actions, Deploy,
Run workflow, environment `production`.

## One-time cluster setup

The manifests expect these to be installed in the cluster already:

- The CloudNativePG operator, for example with its Helm chart:
  `helm install cnpg cloudnative-pg --repo https://cloudnative-pg.github.io/charts --namespace cnpg-system --create-namespace`
- [ingress-nginx](https://kubernetes.github.io/ingress-nginx/) and
  [cert-manager](https://cert-manager.io) with a `ClusterIssuer` named
  `letsencrypt-prod`. If the cluster uses a different ingress controller or issuer,
  change `base/ingress.yaml`.

Point DNS for `staging.deliverybot.dev` and `app.deliverybot.dev` at the
ingress load balancer.

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
