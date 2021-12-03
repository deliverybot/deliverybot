# Hosting

As of September 20th 2020, DeliveryBot transitioned to be a "[project that you will deploy yourself on your own infrastructure](https://deliverybot.dev/2020/02/14/deliverybot-goes-open-source/)". This document explains a simple path to hosting DeliveryBot yourself.

## Create a GitHub App
The first step is to create a [GitHub App](https://docs.github.com/en/developers/apps/getting-started-with-apps/about-apps).

1. [New GitHub App](https://github.com/settings/apps/new)
2. `GitHub App Name` - Name the app, maybe something like `DeliveryBot (Hosted by your.org)`
3. `Homepage URL` - The URL where you expect to be hosting DeliveryBot (eg. `https://deliverybot.your.org`)
4. `Callback URL` - An absolute URL with path `/login/cb` (eg. `https://deliverybot.your.org/login/cb`)
5. `Expire user authorization tokens` - Check this
6. **Permissions and Events** - [This Manifest](https://github.com/deliverybot/deliverybot/blob/master/app.yml) describes the exact permissions which should be granted. You can [use Probot](https://docs.github.com/en/developers/apps/building-github-apps/creating-a-github-app-from-a-manifest) to actually create the app from the manifest, but learning Probot takes more than the one minute it takes to set the permissions manually.
7. `Where can this GitHub App be installed?` - Only on this account
8. Create the app
9. Generate client secrets

## The Environment
Starting from [.env.example](https://github.com/deliverybot/deliverybot/blob/master/.env.example).

```
# Environment configuration.
ENVIRONMENT=production
NODE_ENV=production

# Hosted location
BASE_URL=https://deliverybot.your.org

# GitHub App configuration.
APP_ID=GitHub should tell you the "App ID". It was a six-digit number for me.
CLIENT_ID=When you create the client secret
CLIENT_SECRET=When you create the client secret
WEBHOOK_SECRET= # Blank
PRIVATE_KEY= # Blank

# Use `trace` to get verbose logging or `info` to show less.
LOG_LEVEL=debug
LOG_FORMAT=json

# Go to https://smee.io/new set this to the URL that you are redirected to.
WEBHOOK_PROXY_URL=<blank>
```

### Run Services
With the above environment variables

```
yarn install
yarn build
yarn start
```

The service should be running on port 3000.
