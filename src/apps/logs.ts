import { AuthedRequest, authenticate, verifyRepo } from "./auth";
import { Response, Application } from "express";
import { client } from "../clients/exec";
import * as pkg from "../package";

async function handle(req: AuthedRequest, res: Response) {
  const { owner, repo, id: repoId } = req.user!.repo!;
  const { id } = req.params;
  const logs = await client.logs(repoId, id);

  res.render("logs", { owner, repo, id, pkg, logs });
}

async function json(req: AuthedRequest, res: Response) {
  const { id: repoId } = req.user!.repo!;
  const { id } = req.params;
  const logs = await client.logs(repoId, id);

  res.json({ logs });
}

export function logs(app: Application) {
  app.get("/logs/:owner/:repo/:id/json", authenticate, verifyRepo, json);
  app.get("/logs/:owner/:repo/:id", authenticate, verifyRepo, handle);
}
