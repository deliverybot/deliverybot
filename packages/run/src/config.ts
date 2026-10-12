import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { info } from "@deliverybot/app";
import { logger, Options, localServices } from "@deliverybot/core";
import { postgresServices, migrate } from "@deliverybot/postgres";

const bundle = path.resolve(import.meta.dirname, "..", "bundle");
export const opts: Options = {
  logger,
  id: Number(env("APP_ID")),
  webhookPath: env("WEBHOOK_PATH") || "/api/github/webhooks",
  webhookSecret: env("WEBHOOK_SECRET"),
  appSecret: env("SESSION_SECRET") || env("WEBHOOK_SECRET") || "development",
  privateKey: env("PRIVATE_KEY"),
  config: {
    slackClientId: env("SLACK_CLIENT_ID"),
    slackClientSecret: env("SLACK_CLIENT_SECRET"),
    slackSigningSecret: env("SLACK_SIGNING_SECRET"),
    baseUrl: env("BASE_URL"),
    githubClientId: env("CLIENT_ID"),
    githubClientSecret: env("CLIENT_SECRET"),
    adminLogins: env("ADMIN_GITHUB_LOGINS"),
  },
  locals: info as any,
  root: path.dirname(
    fileURLToPath(import.meta.resolve("@deliverybot/app/package.json")),
  ),
  production: process.env.NODE_ENV === "production",
  scripts: fs.readFileSync(path.resolve(bundle, "scripts.html")).toString(),
  serve: [["/static/bundle/", path.resolve(bundle)]],
};

// Postgres when DATABASE_URL is set, otherwise in-memory storage.
export const db = process.env.DATABASE_URL
  ? postgresServices({ connectionString: process.env.DATABASE_URL })
  : undefined;
export const services = db ? db.services : localServices();

if (db && !opts.production) {
  // Production runs `yarn migrate` before starting.
  migrate(db.pool).catch((error) => {
    logger.error({ error }, "migrations failed");
  });
}

function env(n: string) {
  return process.env[n] || "";
}
