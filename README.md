# Deliverybot

https://deliverybot.dev

Simple continuous delivery for GitHub: fast, safe and secure continuous
delivery pipelines you can set up in minutes. Fully open source.

![Product screenshot](https://deliverybot.dev/assets/images/deploy-list.png)

* **Click to deploy:** click the latest commit in the Deliverybot dashboard to
  deploy your code. It doesn't get any simpler than that.
* **Automatic deployments:** deploy automatically to multiple clusters and
  environments given a specific branch.
* **Advanced deployment workflows:** orchestrate canary deployments to test
  code in incremental steps. Push out environments per pull request.
* **Integrates with Slack:** deploy from Slack as well as from the dashboard.

Deliverybot is a GitHub App. It creates
[GitHub deployments](https://docs.github.com/en/rest/deployments), and your
existing CI (GitHub Actions or anything else that listens for deployment
events) does the actual deploy. See the
[documentation](https://deliverybot.dev/docs/) to get started.

## A note on how this revival was built

Deliverybot was abandoned around 2020. In 2026 I picked it up again to run it as
a hosted service. I don't have the time to take on a project like this by myself,
so most of the work, from modernizing the codebase to building the hosted
version, was done with the help of AI coding tools. I decided what to build,
reviewed the changes and tested them, but without AI this revival wouldn't have
happened at all.

## Development

You need Node.js 22 (see `.nvmrc`), Yarn 1 and, optionally, Docker for a local
Postgres database.

1. Install the dependencies:

       yarn install

2. Copy `.env.example` to `.env` and fill in the credentials of a GitHub App
   you created for development. Set `WEBHOOK_PROXY_URL` to a
   [smee.io](https://smee.io/new) channel so webhooks reach your machine.
3. Start Postgres, or leave `DATABASE_URL` empty to keep data in memory:

       docker compose up -d

4. Build everything once, then start the app in watch mode:

       yarn build
       yarn start

   The dashboard runs on http://localhost:3000.

Run the tests with `yarn test`. The Postgres tests need `DATABASE_URL` to point
at a database.

The code is a Yarn workspace in `packages/`:

* `core`: shared service interfaces, the GitHub App wiring and in-memory storage.
* `app`: the dashboard and the apps that handle GitHub webhooks.
* `client`: the dashboard's browser code and styles.
* `deploybot`: deployment automation, such as `/deploy` commands, auto deploys
  and pull request environments.
* `slackbot`: the Slack integration.
* `postgres`: Postgres storage, migrations and the job queue.
* `run`: the server and worker entry points.

Kubernetes manifests for the hosted service live in
[`deploy/kubernetes`](deploy/kubernetes).

## Contributing

Bug reports and fixes are welcome. Please read the
[Contributing Guide](CONTRIBUTING.md) before opening a pull request.

## License

[MIT](LICENSE) © 2019 Deliverybot (https://github.com/deliverybot/deliverybot)
