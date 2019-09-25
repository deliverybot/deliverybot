import { AuthedRequest, setUser } from "./auth";
import { Response, Application } from "express";
import * as pkg from "../package";

export async function index(req: AuthedRequest, res: Response) {
  if (req.query.watch) {
    res.json({ watch: false });
    return;
  }
  if (!req.user) {
    res.render("probot", { ...pkg, anonymous: true });
    return;
  }

  const installs: any[] = [];
  const installations = await req.user!.github.apps.listInstallationsForAuthenticatedUser(
    {}
  );
  for (const install of installations.data.installations) {
    const repos = await req.user!.github.apps.listInstallationReposForAuthenticatedUser(
      { installation_id: install.id }
    );
    installs.push({
      htmlUrl: install.html_url,
      repos: repos.data.repositories
    });
  }

  res.render("home", { installs, pkg });
}

export function home(app: Application) {
  app.get("/", setUser, index);
}
