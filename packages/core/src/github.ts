import express, { Request, Response } from "express";
import { Probot, ProbotOctokit, Context as ProbotContext } from "probot";
import type {
  EmitterWebhookEvent,
  EmitterWebhookEventName,
} from "@octokit/webhooks";
import { Logger } from "./logger";

/**
 * Webhook event context. Without a type argument the payload is untyped,
 * which is what handlers shared between several events want.
 */
export type Context<E extends EmitterWebhookEventName = any> = ProbotContext<E>;

export type WebhookEvent = EmitterWebhookEvent;
export type Dispatcher = (event: WebhookEvent) => Promise<void>;

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
  private dispatcher?: Dispatcher;

  public withDispatcher(d: Dispatcher) {
    this.dispatcher = d;
    return this;
  }

  /**
   * Listen for an event that isn't a GitHub webhook, such as one our own
   * code sends through `receive`.
   */
  public onCustom(name: string, callback: (context: Context) => Promise<void>) {
    this.webhooks.on(name as any, callback as any);
  }

  public async receive(event: WebhookEvent): Promise<void> {
    if (this.dispatcher) {
      return this.dispatcher(event);
    }
    return super.receive(event);
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
  return new Application({
    appId: opts.id,
    privateKey: opts.privateKey,
    secret: opts.webhookSecret,
    githubToken: opts.githubToken,
    log: opts.logger,
    Octokit: opts.Octokit,
  });
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
      // Some hosts (Cloud Functions) parse the body before we see it and
      // keep the original as a buffer on `rawBody`.
      const raw = (req as any).rawBody;
      const body =
        typeof req.body === "string" ? req.body : raw && raw.toString("utf8");
      if (!id || !name || !signature || !body) {
        res.status(400).json({ error: "missing webhook headers" });
        return;
      }
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
