import { Dependencies, Octokit } from "@deliverybot/core";
import { Response, Request, NextFunction } from "express";
import fetch from "node-fetch";

export interface User {
  id: string;
  username: string;
  token: string;
  avatar: string;
  github: Octokit;
}

export interface AuthedRequest extends Request {
  user?: User;
}

function setUser(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.session && req.session.token;
  if (!token) {
    return next();
  }
  const { id, avatar, login: username } = req.session!;
  if (!id || !username) {
    return next();
  }
  const github = new Octokit({ auth: token });
  req.user = { id, avatar, github, token, username };
  next();
}

export function authenticate(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  const token = req.session && req.session.token;
  if (!token) {
    (req as any).log.info("unauthenticated access redirecting");
    req.session.next = req.url;
    res.redirect("/login");
    return;
  }
  setUser(req, res, next);
}

/**
 * Auth initiates the auth application.
 *
 * Config:
 * - githubClientId
 * - githubClientSecret
 * - baseUrl
 */
export function auth({ app, csrf, config }: Dependencies) {
  const loginUrl = `https://github.com/login/oauth/authorize?scope=user&client_id=${config.githubClientId}&redirect_uri=${config.baseUrl}/login/cb`;

  async function accessToken(code: string): Promise<string> {
    const resp = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        client_id: config.githubClientId,
        client_secret: config.githubClientSecret,
        code,
      }),
    });
    const body = await resp.json();
    return body["access_token"];
  }

  async function callback(req: Request, res: Response) {
    const token = await accessToken(req.query.code as string);
    if (!token) {
      res.redirect("/login");
      return;
    }

    const octokit = new Octokit({ auth: token });
    const user = await octokit.users.getAuthenticated({});

    req.session.avatar = user.data.avatar_url;
    req.session.token = token;
    req.session.id = user.data.id;
    req.session.login = user.data.login;
    const url = req.session.next ? req.session.next : "/";
    if (req.session.next) {
      delete req.session.next;
    }
    res.set("csrf-token", req.csrfToken());
    res.redirect(url);
  }

  app.get("/login", (req: Request, res: Response) => res.redirect(loginUrl));
  app.get("/login/cb", csrf, callback);
}
