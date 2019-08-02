import { AuthedRequest, authenticate, verifyRepo } from "./auth";
import { Response } from "express";
import { Application } from "express";
import { client } from "../clients/secrets";
import * as pkg from "../package";

export async function get(req: AuthedRequest, res: Response) {
  const { owner, repo, id } = req.user!.repo!;
  try {
    const data = await client.get(id);

    res.render("secrets", {
      owner,
      repo,
      pkg,
      secrets: data
    });
  } catch (err) {
    res.status(500);
    res.json({ message: err.message });
  }
}

export async function update(req: AuthedRequest, res: Response) {
  const { id } = req.user!.repo!;
  let data = await client.get(id);
  const body = req.body;
  switch (body.action) {
    case "add":
      if (body.value && body.name) {
        data = data.concat([{ name: body.name, value: body.value }]);
      }
      break;
    case "remove":
      data = data.filter(el => el.name !== body.name);
      break;
  }
  await client.set(id, data);
  res.json({ status: "ok" });
}

export function secrets(app: Application) {
  app.get("/secrets/:owner/:repo", authenticate, verifyRepo, get);
  app.post("/secrets/:owner/:repo", authenticate, verifyRepo, update);
}
