import { Response } from "express";
import { Dependencies } from "@deliverybot/core";
import { WatchStore, EnvLockStore } from "@deliverybot/deploybot";
import { AuthedRequest, authenticate, verifyRepo } from "../auth";
import { Commits, Watch, Config, Metrics } from "./views";
import { Promote, Deploy, SetLock } from "./commands";
import { branch } from "../util";
import { publishRepoUpdated } from "../watch";

export function deploy({ kvService, app, csrf, messageService }: Dependencies) {
  const watchStore = new WatchStore(kvService);
  const lockStore = new EnvLockStore(kvService);

  const baseUrl = "/:owner/:repo";
  const configUrl = `${baseUrl}/config`;
  const metricsUrl = `${baseUrl}/metrics`;
  const indexUrl = `${baseUrl}/branch/:branch`;
  const lockUrl = `${indexUrl}/lock`;
  const unlockUrl = `${indexUrl}/unlock`;
  const commitUrl = `${indexUrl}/o/:sha`;
  const promoteUrl = `${commitUrl}/promote`;

  app.get(baseUrl, csrf, authenticate, verifyRepo, redirect);
  app.get(indexUrl, csrf, authenticate, verifyRepo, index);
  app.post(lockUrl, csrf, authenticate, verifyRepo, lock);
  app.post(unlockUrl, csrf, authenticate, verifyRepo, unlock);
  app.post(commitUrl, csrf, authenticate, verifyRepo, create);
  app.post(promoteUrl, csrf, authenticate, verifyRepo, promote);
  app.get(configUrl, csrf, authenticate, verifyRepo, config);
  app.get(metricsUrl, csrf, authenticate, verifyRepo, metrics);

  async function metrics(req: AuthedRequest, res: Response) {
    if (req.query.watch) {
      res.json({ watch: false });
      return;
    }
    const data = await Metrics({
      path: req.path,
      lock: lockStore,
      minimal: req.headers["accept"] !== "application/json",
      csrf: req.csrfToken(),
      user: req.user!,
      repo: req.user!.repo!,
      branch: "",
    });
    switch (req.headers["accept"]) {
      case "application/json":
        return res.json(data);
      default:
        return res.render("metrics", data);
    }
  }

  async function config(req: AuthedRequest, res: Response) {
    if (req.query.watch) {
      res.json({ watch: false });
      return;
    }
    const data = await Config({
      path: req.path,
      lock: lockStore,
      csrf: req.csrfToken(),
      user: req.user!,
      repo: req.user!.repo!,
      branch: "",
    });
    res.render("config", data);
  }

  async function lock(req: AuthedRequest, res: Response) {
    try {
      await SetLock({
        user: req.user!,
        target: req.body.target,
        repo: req.user!.repo!,
        lock: lockStore,
        state: "locked",
      });
      res.json({ status: "Ok" });
    } catch (error) {
      // Should always succeed.
      req.log.error({ error }, "ui: lock failed");
      res.status(500).json({ status: "ServerError" });
    }
    publishRepoUpdated(messageService, req.user!.repo!);
  }

  async function unlock(req: AuthedRequest, res: Response) {
    try {
      await SetLock({
        user: req.user!,
        target: req.body.target,
        repo: req.user!.repo!,
        lock: lockStore,
        state: "unlocked",
      });
      res.json({ status: "Ok" });
    } catch (error) {
      // Should always succeed.
      req.log.error({ error }, "ui: unlock failed");
      res.status(500).json({ status: "ServerError" });
    }
    publishRepoUpdated(messageService, req.user!.repo!);
  }

  async function promote(req: AuthedRequest, res: Response) {
    const { sha } = req.params;
    try {
      await Promote({
        user: req.user!,
        repo: req.user!.repo!,
        sha,
      });
      res.json({ status: "Ok" });
    } catch (error) {
      // Should always succeed.
      req.log.error({ error }, "ui: promotion failed");
      res.status(500).json({ status: "ServerError" });
    }
  }

  async function create(req: AuthedRequest, res: Response) {
    try {
      const { sha } = req.params;
      await Deploy({
        lock: lockStore,
        user: req.user!,
        log: req.log,
        repo: req.user!.repo!,
        force: req.body.force == "on",
        task: req.body.task,
        target: req.body.target,
        sha,
      });
      res.json({ status: "Ok" });
    } catch (error) {
      req.log.error({ error }, "ui: deploy failed");
      switch ((error as Record<string, unknown>).status) {
        case 400:
        case 409:
        case "LockError":
        case "ConfigError":
          res.status(400).json({ status: "BadRequest", error: (error as Record<string, unknown>).message });
          break;
        default:
          res.status(500).json({ status: "ServerError" });
          break;
      }
    }
  }

  async function index(req: AuthedRequest, res: Response) {
    if (req.query.watch) {
      res.json(Watch(req.user!.repo!, "commits"));
      return;
    }

    const data = await Commits({
      watch: watchStore,
      path: req.path,
      lock: lockStore,
      user: req.user!,
      repo: req.user!.repo!,
      branch: branch.decode(req.params.branch),
      csrf: req.csrfToken(),
      options: {
        count: 10,
        before: req.query.before as string,
        after: req.query.after as string,
        minimal: req.headers["accept"] !== "application/json",
      },
    });

    switch (req.headers["accept"]) {
      case "application/json":
        return res.json(data);
      default:
        return res.render("commits", data);
    }
  }

  async function redirect(req: AuthedRequest, res: Response) {
    const { owner, repo } = req.params;
    const branch = "master";
    res.redirect(`/${owner}/${repo}/branch/${branch}`);
  }
}
