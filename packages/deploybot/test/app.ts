import * as path from "path";
import { ProbotOctokit } from "probot";
import { deploybot } from "../src/index.js";
import { Services, load, logger, localServices } from "@deliverybot/core";

export const services: Services = localServices();
export const app = load(services, [deploybot], {
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
  config: { baseUrl: "https://deliverybot.test" },
  locals: {},
  root: path.resolve(import.meta.dirname, ".."),
  production: false,
  scripts: "",
  serve: [],
});
