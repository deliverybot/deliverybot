import express, { Request, Response } from "express";
import { Probot, ProbotOctokit, Context as ProbotContext } from "probot";
import { getPrivateKey } from "@probot/get-private-key";
import type {
  EmitterWebhookEvent,
  EmitterWebhookEventName,
} from "@octokit/webhooks";
import { Logger } from "./logger.js";

/**
 * Webhook event context. Without a type argument the payload is untyped,
 * which is what handlers shared between several events want.
 */
export type Context<E extends EmitterWebhookEventName = any> = ProbotContext<E>;

export type WebhookEvent = EmitterWebhookEvent;
export type WebhookPayload<E extends EmitterWebhookEventName> =
  EmitterWebhookEvent<E>["payload"];
export type Dispatcher = (event: WebhookEvent) => Promise<void>;
export type EventFilter = (event: WebhookEvent) => boolean | Promise<boolean>;

export interface AppOptions {
  id: number;
  privateKey: string;
  webhookPath: string;
  webhookSecret: string;
  githubToken?: string;
  logger?: Logger;
  Octokit?: typeof ProbotOctokit;
}

/**
 * The GitHub App. A Probot instance that can hand webhook events to a
 * dispatcher (for example a queue) instead of processing them in-process.
 */
export class Application extends Probot {
  /** The GitHub App's id, which tells the deployments it made apart. */
  public appId?: number;
  private dispatcher?: Dispatcher;
  private ignored: EventFilter[] = [];

  public withDispatcher(d: Dispatcher) {
    this.dispatcher = d;
    return this;
  }

  /**
   * Listen for an event that isn't a GitHub webhook, such as one our own
   * code sends through `receive`.
   */
  public onCustom(name: string, callback: (context: Context) => Promise<void>) {
    this.on(name as any, callback as any);
  }

  /**
   * Drop events that match `filter` before they are queued or processed.
   * GitHub sends far more events than the handlers act on (every check run
   * that starts, every comment), and queueing them all holds up the ones
   * that matter, such as a `/deploy` comment. A filter that throws keeps
   * the event, so a failed lookup never loses one.
   */
  public ignore(filter: EventFilter) {
    this.ignored.push(filter);
  }

  public async receive(event: WebhookEvent): Promise<void> {
    if (await this.isIgnored(event)) {
      return;
    }
    if (this.dispatcher) {
      return this.dispatcher(event);
    }
    return super.receive(event);
  }

  private async isIgnored(event: WebhookEvent) {
    for (const filter of this.ignored) {
      try {
        if (await filter(event)) return true;
      } catch (error) {
        this.log.warn({ error, event: event.name }, "event filter failed");
      }
    }
    return false;
  }
}

/**
 * GitHub API client. Pass `auth` to act as a user with their OAuth token.
 */
export class Octokit extends ProbotOctokit {
  constructor(opts: { auth?: string } = {}) {
    super(opts.auth ? { auth: { token: opts.auth } } : {});
  }
}

export function application(opts: AppOptions) {
  const app = new Application({
    appId: opts.id,
    // Accepts the .pem contents as-is, base64 encoded, or with escaped
    // newlines, so it fits in a single-line environment variable.
    privateKey:
      opts.privateKey && !opts.githubToken
        ? getPrivateKey({ env: { PRIVATE_KEY: opts.privateKey } }) || undefined
        : opts.privateKey,
    secret: opts.webhookSecret,
    githubToken: opts.githubToken,
    log: opts.logger,
    Octokit: opts.Octokit,
  });
  app.appId = opts.id;
  return app;
}

/**
 * Express handler that verifies webhook signatures and passes events to
 * `app.receive`. Must be mounted before any body parsing middleware.
 */
export function webhooks(app: Application) {
  return [
    express.text({ type: "*/*", limit: "25mb" }),
    async (req: Request, res: Response) => {
      const id = req.get("x-github-delivery");
      const name = req.get("x-github-event");
      const signature = req.get("x-hub-signature-256");
      const body = typeof req.body === "string" ? req.body : "";
      if (!id || !name || !signature || !body) {
        res.status(400).json({ error: "missing webhook headers" });
        return;
      }
      await app.ready();
      if (!(await app.webhooks.verify(body, signature))) {
        res.status(401).json({ error: "signature does not match" });
        return;
      }
      await app.receive({
        id,
        name: name as any,
        payload: JSON.parse(body),
      });
      res.status(200).send("ok");
    },
  ];
}
