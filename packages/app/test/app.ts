import * as path from "path";
import { ProbotOctokit } from "probot";
import { Services, load, logger, localServices } from "@deliverybot/core";
import { apps, info } from "../src/index.js";

export const services: Services = localServices();
export const app = load(services, apps, {
  logger,
  id: 1,
  webhookPath: "/events",
  webhookSecret: "foobar",
  appSecret: "foobar",
  privateKey: "foobar",
  githubToken: "test",
  Octokit: ProbotOctokit.defaults({
    retry: { enabled: false },
    throttle: { enabled: false },
  }),
  config: {
    baseUrl: "https://deliverybot.test",
    slackClientId: "slack-client",
    slackClientSecret: "slack-secret",
    slackSigningSecret: "slack-signing",
  },
  locals: info,
  root: path.resolve(import.meta.dirname, ".."),
  production: false,
  scripts: "",
  serve: [],
});
