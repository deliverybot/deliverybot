import { AuthedRequest, setUser } from "./auth";
import { Response, Application } from "express";
import * as pkg from "../package";

export async function index(req: AuthedRequest, res: Response) {
  if (!req.user) {
    req.session!.started = Date.now();
    res.render("probot", { pkg, anonymous: true });
    return;
  }

  const repoList: Array<{ repo: string; owner: string }> = [];
  const installations = await req.user!.github.apps.listInstallationsForAuthenticatedUser(
    {}
  );
  for (const install of installations.data.installations) {
    const repos = await req.user!.github.apps.listInstallationReposForAuthenticatedUser(
      { installation_id: install.id }
    );
    for (const repo of repos.data.repositories) {
      repoList.push({ repo: repo.name, owner: repo.owner.login });
    }
  }

  res.render("repos", { repos: repoList, pkg });
}

export function repo(app: Application) {
  app.get("/", setUser, index);
}
