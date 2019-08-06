import { AuthedRequest, authenticate, verifyRepo } from "./auth";
import { Response, Application } from "express";
import { client } from "../clients/exec";
import * as pkg from "../package";

async function handle(req: AuthedRequest, res: Response) {
  const github = req.user!.github;
  const { owner, repo, id } = req.params;
  const deployment = await github.repos.getDeployment({
    owner,
    repo,
    deployment_id: id
  });
  res.render("logs", {
    owner,
    repo,
    id,
    pkg,
    deployment: deployment.data
  });
}

async function json(req: AuthedRequest, res: Response) {
  const github = req.user!.github;
  const { owner, repo, id } = req.params;

  // Deployment check, will error if this deployment doesn't belong to the repo.
  await github.repos.getDeployment({
    owner,
    repo,
    deployment_id: id
  });
  try {
    const logs = await client.logs(id);
    res.json(logs);
  } catch (err) {
    res.json({ state: "PENDING" });
  }
}

export function logs(app: Application) {
  app.get("/logs/:owner/:repo/:id/json", authenticate, verifyRepo, json);
  app.get("/logs/:owner/:repo/:id", authenticate, verifyRepo, handle);
}
