import * as path from "path";
export { apps, main, slack, jobs } from "./apps";
export { load, logger } from "@deliverybot/core";

const pkg = require(path.join(__dirname, "..", "package.json"));
export const info: { [k: string]: string } = {
  version: pkg.version,
  homepage: "https://deliverybot.dev",
  blog: "https://deliverybot.dev/blog/",
  integrations: "https://deliverybot.dev/integrations/",
  status: "https://deliverybot.dev/status/",
  community: "https://spectrum.chat/deliverybot",
  documentation: "https://deliverybot.dev/docs/",
  support: "support@deliverybot.dev",
  github: "https://github.com/deliverybot/deliverybot",
  terms: "https://deliverybot.dev/terms/terms/",
  privacy: "https://deliverybot.dev/terms/privacy/",
  install: "https://github.com/apps/deliverybot/installations/new",
};
