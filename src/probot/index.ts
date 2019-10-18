import { Application } from "./application";
import { App as OctokitApp } from "@octokit/app";
import * as express from "express";
import Webhooks from "@octokit/webhooks";
import { WEBHOOK_PATH, WEBHOOK_SECRET, APP_ID, PRIVATE_KEY } from "../config";
import Octokit from "@octokit/rest";
import { createDefaultCache } from "./cache";
import { Logger, defaultLogger } from "../logger";

const cache = createDefaultCache();

export function app(opts?: { logger?: Logger }) {
  const logger = (opts && opts.logger) || defaultLogger;
  return new Application({
    logger,
    Octokit: Octokit,
    app: new OctokitApp({
      id: APP_ID,
      privateKey: PRIVATE_KEY
    }),
    cache
  });
}

export function probot(server: express.Application) {
  const probot = app();
  const hooks = new Webhooks({
    path: WEBHOOK_PATH,
    secret: WEBHOOK_SECRET
  });

  server.use(hooks.middleware);
  hooks.on("*", async (event: Webhooks.WebhookEvent<any>) => {
    await probot.receive(event);
  });

  hooks.on("error", (err: Error) => {
    console.error(err);
  });
  return probot;
}

export { Application } from "./application";
export { Context } from "./context";
export { Logger } from "../logger";
export { default as Octokit } from "@octokit/rest";
