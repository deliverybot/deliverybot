# Deliverybot

https://deliverybot.dev

Simple Continuous Delivery for GitHub: Fast, safe and secure Continous Delivery
pipelines you can setup in minutes. Fully open source.

![Product screenshot](https://deliverybot.dev/assets/images/deploy-list.png)

* Click to deploy: Click the latest commit in the Deliverybot dashboard to
  deploy your code. It doesn't get any simpler than that.
* Automatic deployments: Deploy automatically to multiple clusters and
  environments given a specific branch.
* Advanced deployment workflows: Orchestrate canary deployments to test code in
  incremental steps. Push out environments per pull request.
* Integrates with slack: Deploy from slack as well as deployments from a
  dashboard.

## A note on how this revival was built

Deliverybot was abandoned around 2020. In 2026 I picked it up again to run it as
a hosted service. I don't have the time to take on a project like this by myself,
so most of the work, from modernizing the codebase to building the hosted
version, was done with the help of AI coding tools. I decided what to build,
reviewed the changes and tested them, but without AI this revival wouldn't have
happened at all.

## Contributing

If you have suggestions for how deliverybot could be improved, or want to report
a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

### Setup

    yarn install
    yarn start

## License

[MIT](LICENSE) © 2019 Deliverybot (https://github.com/deliverybot/deliverybot)

