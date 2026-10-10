import * as path from "path";
import { ProbotOctokit } from "probot";
import { Services, load, logger, localServices } from "@deliverybot/core";
import { apps, info } from "../src";

export const services: Services = localServices();
export const app = load(services, apps, {
  logger,
  id: 1,
  webhookPath: '/events',
  webhookSecret: 'foobar',
  appSecret: 'foobar',
  privateKey: 'foobar',
  githubToken: 'test',
  Octokit: ProbotOctokit.defaults({
    retry: { enabled: false },
    throttle: { enabled: false },
  }),
  config: {},
  locals: info,
  root: path.resolve(__dirname, ".."),
  production: false,
  scripts: "",
  serve: [],
});
