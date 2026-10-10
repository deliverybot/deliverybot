import * as path from "path";
import * as fs from "fs";
import { apps, info } from "@deliverybot/app";
import { load, logger, Options, localServices } from "@deliverybot/core";
import { postgresServices, migrate } from "@deliverybot/postgres";

const services = storage();
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

// Postgres when DATABASE_URL is set, otherwise in-memory storage.
function storage() {
  if (!process.env.DATABASE_URL) {
    return localServices();
  }
  const db = postgresServices({ connectionString: process.env.DATABASE_URL });
  if (process.env.NODE_ENV !== "production") {
    // Production runs `yarn migrate` before starting.
    migrate(db.pool).catch((error) => {
      logger.error({ error }, "migrations failed");
    });
  }
  return db.services;
}

function env(n: string) {
  return process.env[n] || "";
}

export = load(services, apps, opts);
