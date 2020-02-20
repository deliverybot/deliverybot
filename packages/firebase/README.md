# @deliverybot/firebase

Configures a firebase deployment target by implementing all services on top of
firebase.

### Deployment configuration

During deployments files are copied from `env/<environment>` into `lib/config`
which should hold the necessary configuration for the application. The two
expected configuration files are:

`client.json`

```javascript
{
  "firebase": ...    // Firebase app configuration.
  "stackdriver": ... // Stackdriver api key and project.
}
```

`server.json`

```javascript
{
  "ENVIRONMENT": "production",
  "NODE_ENV": "production",
  "LOG_FORMAT": "json",
  "BASE_URL": "https://app.deliverybot.dev",
  "PRIVATE_KEY": "GitHub private key",
  "CLIENT_ID": "GitHub client id",
  "CLIENT_SECRET": "GitHub client secret",
  "WEBHOOK_SECRET": "GitHub webhook client secret",
  "APP_ID": "GitHub app id",
  "SLACK_APP_ID": "Slack app id",
  "SLACK_CLIENT_ID": "Slack client id",
  "SLACK_CLIENT_SECRET": "Slack client secret",
  "SLACK_SECRET": "Slack signing secret",
  "SLACK_LOGIN_URL": "Slack app url",
}
```
