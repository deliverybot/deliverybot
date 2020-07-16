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

## Contributing

If you have suggestions for how deliverybot could be improved, or want to report
a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

### Setup

#### Github

1. setup "User authorization callback URL" to "http://localhost:3000/login/cb"
2. setup "Post installation / Setup URL" to "http://localhost:3000"
3. setup "Webhook URL" to "https://smee.io/xxxxx"

#### Local environment

> Note: You do not need to start smee separately, the start script will do it.

    # install tsc
    npm install --global typescript
    yarn install
    BASE_URL=http://localhost:3000 yarn start

## License

[MIT](LICENSE) © 2019 Deliverybot (https://github.com/deliverybot/deliverybot)

