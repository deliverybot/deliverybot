import { AuthedRequest, authenticate } from "../auth.js";
import { Response } from "express";
import { Dependencies } from "@deliverybot/core";
import { Index, Repos, MySettings } from "./views.js";

/** How many repositories the recent repositories sidebar lists. */
const RECENT_REPOS = 5;

export function dashboard({
  app,
  csrf,
  installationService,
  userService,
}: Dependencies) {
  const store = installationService();

  async function recents(req: AuthedRequest) {
    const visits = await userService().recentVisits(req.user!.id, RECENT_REPOS);
    return visits.map((v) => {
      const [owner, repo] = v.fullName.split("/");
      return { owner, repo };
    });
  }

  async function index(req: AuthedRequest, res: Response) {
    const data = await Index({
      user: req.user!,
      csrf: req.csrfToken(),
      recents: await recents(req),
    });
    res.render("index", data);
  }

  async function repos(req: AuthedRequest, res: Response) {
    const { name } = req.params;
    const data = await Repos({
      user: req.user!,
      csrf: req.csrfToken(),
      name,
      query: req.query,
      store,
      recents: await recents(req),
    });
    return res.render("repos", data);
  }

  async function mySettings(req: AuthedRequest, res: Response) {
    const data = await MySettings({
      user: req.user!,
      csrf: req.csrfToken(),
    });
    res.render("my-settings", data);
  }

  app.get("/", csrf, authenticate, index);
  app.get("/settings", csrf, authenticate, mySettings);
  app.get("/:name", csrf, authenticate, repos);
}
