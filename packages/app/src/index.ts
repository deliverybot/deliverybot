import * as fs from "fs";
import * as path from "path";
import type { Probot } from "probot";
export { apps, main, slack, jobs } from "./apps/index.js";
export { syncInstallations } from "./apps/installations.js";
export { load, logger } from "@deliverybot/core";

const pkg = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, "..", "package.json"), "utf8"),
);
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

/**
 * Points install links at the GitHub App this deployment runs as, so a
 * staging deployment links to the staging app instead of the public one.
 */
export async function useOwnInstallUrl(probot: Probot) {
  const octokit = await probot.auth();
  const { data } = await octokit.rest.apps.getAuthenticated();
  if (data?.html_url) {
    info.install = `${data.html_url}/installations/new`;
  }
}
