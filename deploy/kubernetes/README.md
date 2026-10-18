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

Deliverybot deploys itself. The `Image` workflow
(`.github/workflows/image.yml`) builds an image for every push to `master` and
pushes it to `ghcr.io/deliverybot/deliverybot`, tagged with the commit SHA.
Deliverybot, configured in `.github/deploy.yml`, then creates GitHub
deployments: staging automatically once CI passes, and production right after
staging deployed the same commit. A finished staging deploy sets the
`deploy/staging` commit status, which the production target waits for; a
failed staging deploy sets it to failure, so production stays on the previous
commit. An older commit is deployed by hand from the dashboard. Each deployment runs the `Deploy`
workflow (`.github/workflows/deploy.yml`), which applies the overlay and
reports the result as deployment statuses. It builds the image itself when
there isn't one yet, so branches and pull requests (`/deploy staging`) can be
deployed too. Re-running an `Image` run doesn't
deploy; redeploy from the dashboard or with the break-glass run below.

### Break glass

A bad deploy can take Deliverybot down, and then it can't deploy the fix. The
`Deploy` workflow can always be run by hand: Actions, Deploy, Run workflow, pick
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
- The Barman Cloud plugin in the operator's namespace, for backups:
  `helm install plugin-barman-cloud plugin-barman-cloud --repo https://cloudnative-pg.github.io/charts --namespace cnpg-system`
  (it needs cert-manager), and a Barman Cloud `ObjectStore` named
  `postgres-backups` in each namespace (see [Backups](#backups)).
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
- Optional variable `ADMIN_GITHUB_LOGINS`: GitHub logins, comma separated,
  that can open the admin dashboard.
- Optional Slack secrets: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`,
  `SLACK_SIGNING_SECRET`. See `packages/slackbot/README.md` for creating the
  Slack app.

Then add the repository variable `DEPLOY_ENABLED` with the value `true`
(Settings, Secrets and variables, Actions, Variables). The workflow does
nothing until it is set.

The workflow copies these secrets into a `deliverybot` Secret in the namespace
on every deploy. After the first run, make the
`ghcr.io/deliverybot/deliverybot` package public (its package settings) so the
cluster can pull the image without credentials. Set the GitHub App's webhook URL to
`https://<host>/api/github/webhooks` and its callback URL to
`https://<host>/login/cb`.

## Admin dashboard

`/_/admin` lists installations, their repositories and recent activity, and
who signed in to the dashboard. Only the GitHub logins in the
`ADMIN_GITHUB_LOGINS` environment variable can open it; everyone else gets a
404.

Installations are recorded from installation webhooks. To copy in ones made
before that, or to repair missed webhooks, run once per environment:

```sh
kubectl -n deliverybot-staging exec deploy/web -- node packages/run/lib/sync-installations.js
```

## Database

CloudNativePG creates the `deliverybot` database and a `deliverybot-db-app`
Secret holding its connection string. Each `web` pod runs migrations in an
init container before it starts. Migrations take a Postgres advisory lock, so
pods starting together don't conflict.

### Backups

The [Barman Cloud plugin](https://cloudnative-pg.io/plugin-barman-cloud/)
archives WAL to object storage continuously and `base/backup.yaml` schedules a
base backup every night at 03:00 UTC, so the database can be restored to any
point in the retention window. The cluster writes to the `postgres-backups`
`ObjectStore` in its namespace, which sets the bucket, its credentials and the
retention. It isn't part of these manifests; create it before deploying.

Check the archive and the latest backups with:

```sh
kubectl -n deliverybot-production get cluster deliverybot-db \
  -o jsonpath='{.status.conditions[?(@.type=="ContinuousArchiving")]}'
kubectl -n deliverybot-production get backups
```

To restore, create a new `Cluster` that bootstraps from the object store (see
[Restoring a Cluster](https://cloudnative-pg.io/plugin-barman-cloud/docs/usage/#restoring-a-cluster)),
optionally with a `recoveryTarget` time, and point the app's secret at it. Use
a different `serverName` for the new cluster so it doesn't archive over the
old one's WAL.

## Trying it locally

```sh
kind create cluster
kubectl apply --server-side -f <CloudNativePG operator manifest>
docker build -t deliverybot:dev .
kind load docker-image deliverybot:dev
kubectl kustomize deploy/kubernetes/overlays/staging   # renders the manifests
```
