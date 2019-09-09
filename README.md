# deliverybot

Complete deployment automation for GitHub. https://deliverybot.dev

## Features

Deployment automation:

- Automatic deployments on master or specific branches.
- Wait for status checks to pass before deploying.
- Review environments using `/deploy` commands in pull requests.
- Validate a deploy has succeeded before merging.

## Setup

```sh
# Install dependencies
npm install

# Run typescript
npm run build

# Run the bot
npm start
```

## Contributing

If you have suggestions for how deliverybot could be improved, or want to report
a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2019 Deliverybot (https://github.com/deliverybot/deliverybot)
