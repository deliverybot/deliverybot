import { auth } from "./auth.js";
import { deploy } from "./deploy/index.js";
import { dashboard } from "./dashboard/index.js";
import { watch } from "./watch.js";
import { slackbot } from "@deliverybot/slackbot";
import { deploybot } from "@deliverybot/deploybot";
import { util } from "./util.js";
import { installations } from "./installations.js";

/**
 * Url structure is similar to GitHub in that you reach a org/user and repo with
 * the path: /:owner/:repo
 *
 * This means that all url's that override that: /login, /settings need to be
 * registered before the deploy app. For internal non public routes we use the
 * prefix of /_/ to just avoid a user may be named that route.
 */
export const apps = [
  util,
  auth,
  slackbot,
  dashboard,
  deploy,
  watch,
  deploybot,
  installations,
];

export const main = [util, auth, dashboard, deploy, watch];
export const slack = [slackbot];
export const jobs = [deploybot, watch, installations];
