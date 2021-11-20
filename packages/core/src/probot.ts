import * as express from "express";
import Webhooks from "@octokit/webhooks";
import { Octokit } from "@octokit/rest";
import { App as OctokitApp } from "@octokit/app";
import { Application } from "./application";
import { createDefaultCache } from "./cache";
import { Logger, logger } from "./logger";

export interface AppOptions {
  id: number;
  appSecret: string;
  privateKey: string;
  webhookPath: string;
  webhookSecret: string;
  logger: Logger;
}

const cache = createDefaultCache();

export function app(opts: AppOptions) {
  return new Application({
    logger: (opts && opts.logger) || logger,
    Octokit: Octokit,
    app: new OctokitApp({
      id: opts.id,
      privateKey: opts.privateKey,
    }),
    cache,
  });
}

export function probot(opts: AppOptions, server: express.Application) {
  const probot = app(opts);
  const hooks = new Webhooks({
    path: opts.webhookPath,
    secret: opts.webhookSecret,
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
