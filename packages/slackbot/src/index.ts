import crypto from "crypto";
import { EnvLockStore } from "@deliverybot/deploybot";
import { Dependencies } from "@deliverybot/core";
import { AuthedRequest, authenticate } from "./auth.js";
import { verifySignature } from "./util.js";
import * as path from "path";
import { associateError, handle } from "./command.js";
import { SlackUserStore } from "./store.js";
import { freshToken } from "./token.js";

const dir = path.join(import.meta.dirname, "..", "views");
const views = {
  success: path.join(dir, "success.hbs"),
  connect: path.join(dir, "connect.hbs"),
};

/**
 * Slackbot initiates the slackbot application.
 *
 * Config:
 * - baseUrl
 * - githubClientId
 * - githubClientSecret
 * - slackClientId
 * - slackClientSecret
 * - slackSigningSecret
 */
export function slackbot({ app, kvService, config }: Dependencies) {
  const store = new SlackUserStore(kvService);
  const locker = new EnvLockStore(kvService);
  const loginUrl = `${config.baseUrl}/slack/install`;
  const redirectUri = `${config.baseUrl}/slack/callback`;

  // Signing in with Slack tells us the Slack user id to link the GitHub
  // account to. The state ties the callback to this browser.
  app.get("/slack/install", (req, res) => {
    const state = crypto.randomBytes(16).toString("base64url");
    req.session.slackState = state;
    const params = new URLSearchParams({
      client_id: config.slackClientId || "",
      scope: "commands",
      redirect_uri: redirectUri,
      state,
    });
    res.redirect(`https://slack.com/oauth/v2/authorize?${params}`);
  });

  app.get("/slack/callback", async (req, res) => {
    const { slackState } = req.session;
    delete req.session.slackState;
    if (!slackState || req.query.state !== slackState) {
      req.log.info("slack callback with an unknown state");
      res.redirect("/slack/install");
      return;
    }

    const resp = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(req.query.code || ""),
        client_id: config.slackClientId || "",
        client_secret: config.slackClientSecret || "",
        redirect_uri: redirectUri,
      }),
    });
    const body = await resp.json();
    const userId = body.ok && body.authed_user && body.authed_user.id;
    if (!userId) {
      req.log.error({ error: body.error }, "slack callback failed");
      res.sendStatus(400);
      return;
    }
    req.log.info({ user: userId }, "slack got user");
    // Sends a success page -- includes a link to /slack/associate.
    req.session.slackId = userId;
    res.render(views.connect, {});
  });

  app.get("/slack/associate", authenticate, async (req: AuthedRequest, res) => {
    if (req.session.slackId && req.user && req.user.id) {
      await store.associate({
        slack: { id: req.session.slackId },
        github: {
          id: req.user.id,
          username: req.user.username,
          token: req.user.token,
          refreshToken: req.session.refreshToken,
          expiresAt: req.session.tokenExpiresAt,
        },
      });
      res.render(views.success, {});
      return;
    }
    throw new Error("Invalid association claim");
  });

  app.post("/slack/command", async (req, res) => {
    const {
      text,
      team_id: teamId,
      user_id: userId,
      response_url: response,
    } = req.body;
    req.log.info({ text, teamId, userId }, "handling slack request");

    if (!verifySignature(config.slackSigningSecret || "", req)) {
      res.sendStatus(400);
      return;
    }

    try {
      const user = await store.get(userId);
      if (!user) {
        res.json(associateError({ loginUrl }));
        return;
      }
      user.github = await freshToken(user.github, config, async (github) => {
        await store.associate({ ...user, github });
      });

      const team = { id: teamId };
      const ctx = {
        loginUrl,
        lock: locker,
        text: text || "",
        team,
        user,
        response,
        log: req.log,
      };
      res.json(handle(ctx));
    } catch (err) {
      req.log.error({ err }, "failed: handling slack request");
      res.json(associateError({ loginUrl }));
      return;
    }
  });

  return app;
}
