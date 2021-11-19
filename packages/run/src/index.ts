import * as path from "path";
import * as fs from "fs";
import { apps, info } from "@deliverybot/app";
import { load, logger, Options, localServices, RegisterFunc } from "@deliverybot/core";

const services = localServices();
const bundle = path.resolve(__dirname, "..", "bundle");
const opts: Options = {
  logger,
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
  locals: info as any,
  root: path.dirname(require.resolve("@deliverybot/app/package.json")),
  production: process.env.NODE_ENV === "production",
  scripts: fs.readFileSync(path.resolve(bundle, "scripts.html")).toString(),
  serve: [["/static/bundle/", path.resolve(bundle)]],
};

function env(n: string) {
  return process.env[n] || "";
}

export = load(services, apps as RegisterFunc[], opts);
