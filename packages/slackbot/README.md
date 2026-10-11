# @deliverybot/slackbot

Slackbot implements the following slash deploy commands:

```
/deliverybot help
/deliverybot login
/deliverybot deploy deliverybot/example@master production
```

## Setting up the Slack app

Each deployment needs its own Slack app, because Slack sends commands to one
URL. Below, `<host>` is the deployment's `BASE_URL`, for example
`https://app.deliverybot.dev`.

1. At https://api.slack.com/apps, choose Create New App, From a manifest,
   pick the workspace, and paste `manifest.yml` from this package with
   `<host>` replaced.
2. Basic Information: copy the Client ID, Client Secret and Signing Secret
   into `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` and `SLACK_SIGNING_SECRET`.
3. To let other workspaces install the app, turn on Manage Distribution.

The GitHub App's callback URL must be `<host>/login/cb`, as for the
dashboard.

## Connecting accounts

Every Slack user runs `/deliverybot login` once and follows the button: it
signs them in with Slack (to learn their Slack user id), then with GitHub, and
stores the link. Deploys from Slack run as that GitHub user. When the GitHub
App's user tokens expire, the stored refresh token renews them; if that
fails, the user is asked to log in again.
