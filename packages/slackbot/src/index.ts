import { EnvLockStore } from "@deliverybot/deploybot";
import fetch from "node-fetch";
import { Dependencies } from "@deliverybot/core";
import { AuthedRequest, authenticate } from "./auth";
import { verifySignature } from "./util";
import * as path from "path";
import { associateError, handle } from "./command";
import { SlackUserStore } from "./store";

const dir = path.join(__dirname, "..", "views");
const views = {
  success: path.join(dir, "success.hbs"),
  connect: path.join(dir, "connect.hbs"),
};

/**
 * Slackbot initiates the slackbot application.
 *
 * Config:
 * - slackLoginUrl
 * - slackClientId
 * - slackClientSecret
 * - slackSecret
 */
export function slackbot({ app, kvService, config }: Dependencies) {
  const store = new SlackUserStore(kvService);
  const locker = new EnvLockStore(kvService);

  app.get("/slack/install", (req, res) => {
    res.redirect(config.slackLoginUrl!);
  });

  app.get("/slack/callback", async (req, res) => {
    const resp = await fetch(
      `https://slack.com/api/oauth.access?code=${req.query.code}&client_id=${config.slackClientId}&client_secret=${config.slackClientSecret}`,
    );
    const body = await resp.json();
    if (!body.ok) {
      req.log.error({ body }, "slack callback failed");
      res.sendStatus(400);
      return;
    }
    req.log.info({ user: body.user_id }, "slack got user");
    // Sends a success page -- includes a link to /slack/associate.
    req.session!.slackId = body.user_id;
    res.render(views.connect, {});
  });

  app.get("/slack/associate", authenticate, async (req: AuthedRequest, res) => {
    if (req.session && req.session.slackId && req.user && req.user.id) {
      await store.associate({
        slack: { id: req.session.slackId },
        github: {
          id: req.user.id,
          username: req.user.username,
          token: req.user.token,
        },
      });
      res.render(views.success, {});
      return;
    }
    throw new Error("Invalid association claim");
  });

  app.post("/slack/command", async (req, res) => {
    req.log.info({ body: req.body }, "handling slack request");

    const {
      text,
      team_id: teamId,
      user_id: userId,
      response_url: response,
    } = req.body;
    if (!verifySignature(config.slackSecret!, req)) {
      res.sendStatus(400);
      return;
    }

    try {
      const user = await store.get(userId);
      if (!user) {
        res.json(associateError(teamId));
        return;
      }

      const team = { id: teamId };
      const ctx = {
        loginUrl: config.slackLoginUrl!,
        lock: locker,
        text,
        team,
        user,
        response,
        log: req.log,
      };
      res.json(handle(ctx));
    } catch (err) {
      req.log.error({ err }, "failed: handling slack request");
      res.json(associateError({ loginUrl: config.slackLoginUrl! }));
      return;
    }
  });

  return app;
}
