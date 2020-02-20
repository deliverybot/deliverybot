const config = {
  server: require("./config/server.json"),
  client: require("./config/client.json"),
};

process.env.LOG_FORMAT = config.server.LOG_FORMAT;
process.env.LOG_LEVEL = config.server.LOG_LEVEL;
process.env.NODE_ENV = config.server.NODE_ENV;

import * as path from "path";
import * as fs from "fs";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { LoggingBunyan } from "@google-cloud/logging-bunyan";
import * as apps from "@deliverybot/app";
import { load, logger, Options } from "@deliverybot/core";
import { firebase } from "./services";

logger.addStream(new LoggingBunyan().stream("info"));

const services = firebase(admin.initializeApp());
const pubsub = services.pubsubService();

const opts: Options = {
  logger,
  dispatcher: pubsub.dispatcher,
  id: Number(env("APP_ID")),
  webhookPath: env("WEBHOOK_PATH"),
  webhookSecret: env("WEBHOOK_SECRET"),
  appSecret: env("WEBHOOK_SECRET") || "development",
  privateKey: env("PRIVATE_KEY"),
  config: {
    slackLoginUrl: env("SLACK_LOGIN_URL"),
    slackClientId: env("SLACK_CLIENT_ID"),
    slackClientSecret: env("SLACK_CLIENT_SECRET"),
    baseUrl: env("BASE_URL"),
    githubClientId: env("CLIENT_ID"),
    githubClientSecret: env("CLIENT_SECRET"),
  },
  locals: {
    ...apps.info,
    ...config.client,
  },
  root: path.dirname(require.resolve("@deliverybot/app/package.json")),
  production: env("NODE_ENV") === "production",
  scripts: fs
    .readFileSync(path.resolve(__dirname, "config", "scripts.html"))
    .toString(),
  serve: [],
};

export const app = functions.https.onRequest(
  load(services, apps.main, opts).express,
);

export const slack = functions.https.onRequest(
  load(services, apps.slack, opts).express,
);

export const job = functions.pubsub.topic("deliverybot").onPublish(
  pubsub.receiver(
    load(services, apps.jobs, {
      ...opts,
      dispatcher: undefined, // Must be null to actually process.
    }).probot,
  ),
);

function env(n: string) {
  return config.server[n] || "";
}
