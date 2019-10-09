import { AuthedRequest, authenticate } from "./auth";
import { Response, Application } from "express";
import * as pkg from "../package";

export async function index(req: AuthedRequest, res: Response) {
  if (req.query.watch) {
    res.json({ watch: false });
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

  res.render("home", { hasInstalls: installs.length >= 1, installs, pkg });
}

export function home({ app }: { app: Application }) {
  app.get("/", authenticate, index);
}
