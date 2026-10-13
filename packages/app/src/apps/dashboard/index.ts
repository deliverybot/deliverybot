import { AuthedRequest, authenticate } from "../auth.js";
import { Response } from "express";
import { Dependencies } from "@deliverybot/core";
import { Index, Repos, MySettings } from "./views.js";

export function dashboard({ app, csrf }: Dependencies) {
  async function index(req: AuthedRequest, res: Response) {
    const data = await Index({
      user: req.user!,
      csrf: req.csrfToken(),
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
