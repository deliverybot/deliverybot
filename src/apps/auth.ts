import Octokit from "@octokit/rest";
import { Response, Request, NextFunction } from "express";
import request from "request";
import { Application } from "express";
import { CLIENT_ID, CLIENT_SECRET, BASE_URL } from "../config";

export interface AuthedRequest extends Request {
  user?: {
    id: string;
    username: string;
    token: string;
    github: Octokit;
    repo?: { owner: string; repo: string; id: string };
  };
}

export function setUser(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.session && req.session.token;
  if (!token) {
    return next();
  }
  const username = req.session!.login;
  const id = req.session!.id;
  if (!id || !username) {
    return next();
  }
  const github = new Octokit({ auth: token });
  req.user = { id, github, token, username };
  next();
}

export function authenticate(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  const token = req.session && req.session.token;
  if (!token) {
    (req as any).log.info("unauthenticated access redirecting");
    res.redirect("/login");
    return;
  }
  setUser(req, res, next);
}

export async function canWrite(
  gh: Octokit,
  { owner, repo, username }: { owner: string; repo: string; username: string }
): Promise<boolean> {
  const perms = await gh.repos.getCollaboratorPermissionLevel({
    owner,
    repo,
    username
  });
  return ["admin", "write"].includes(perms.data.permission);
}

export async function verifyRepo(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  const { owner, repo } = req.params;
  const username = req.user!.username;
  const octokit = req.user!.github;
  if (
    req.session &&
    req.session.verified &&
    req.session.verified[`${owner}/${repo}`]
  ) {
    const id = req.session.verified[`${owner}/${repo}`];
    req.user!.repo = { owner, repo, id };
    next();
    return;
  }

  const repoData = await octokit.repos.get({ owner, repo });
  const id = `${repoData.data.id}`;
  const write = await canWrite(octokit, { owner, repo, username });
  if (!write) {
    (req as any).log.info({ owner, repo }, "no write access");
    res.redirect("/login");
    return;
  }
  req.session!.verified = req.session.verified || {};
  req.session.verified[`${owner}/${repo}`] = id;
  req.user!.repo = { owner, repo, id };
  next();
}

function accessToken(code: string): Promise<string> {
  return new Promise((resolve, reject) => {
    request.post(
      {
        headers: {
          accept: "application/json"
        },
        url: "https://github.com/login/oauth/access_token",
        form: {
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code
        }
      },
      (err: Error, _: request.Response, body: any) => {
        if (err) {
          return reject(err);
        }

        const data = JSON.parse(body);
        const token = data["access_token"];
        resolve(token);
      }
    );
  });
}

export async function callback(req: Request, res: Response) {
  const token = await accessToken(req.query.code);
  const octokit = new Octokit({ auth: token });
  const user = await octokit.users.getAuthenticated({});

  req.session!.token = token;
  req.session!.id = user.data.id;
  req.session!.login = user.data.login;
  res.redirect("/");
}

const loginUrl = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${BASE_URL}/login/cb`;

export function auth(app: Application) {
  app.get("/login", (req: Request, res: Response) => res.redirect(loginUrl));
  app.get("/login/cb", callback);
  app.get("/logout", (req: Request, res: Response) => {
    req.session = {};
    res.redirect("/");
  });
}
