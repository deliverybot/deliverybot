import * as path from "path";
import { deploybot } from "../src";
import { Services, load, logger, localServices } from "@deliverybot/core";

export const services: Services = localServices();
export const app = load(services, [deploybot], {
  logger,
  id: 1,
  webhookPath: '/events',
  webhookSecret: 'foobar',
  appSecret: 'foobar',
  privateKey: 'foobar',
  config: {},
  locals: {},
  root: path.resolve(__dirname, ".."),
  production: false,
  scripts: "",
  serve: [],
});
