import Octokit from "@octokit/rest";
import { Response, Request, NextFunction } from "express";
import request from "request";
import { Application } from "express";
import { CLIENT_ID, CLIENT_SECRET, BASE_URL } from "../config";

export interface AuthedRequest extends Request {
  user?: {
    username: string;
    token: string;
    github: Octokit;
    repo?: { owner: string; repo: string; id: string };
  };
}

export function setUser(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.session && req.session.token;
  if (!token) {
    next();
    return;
  }
  const username = req.session!.login;
  const octokit = new Octokit();
  octokit.authenticate({ type: "token", token });
  req.user = {
    github: octokit,
    token,
    username
  };
  next();
}

export function authenticate(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  const token = req.session && req.session.token;
  if (!token) {
    res.redirect("/login");
    return;
  }
  setUser(req, res, next);
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
  const perms = await octokit.repos.getCollaboratorPermissionLevel({
    owner,
    repo,
    username
  });
  if (perms.data.permission !== "admin") {
    res.redirect("/login");
    return;
  }
  req.session!.verified = req.session.verified || {};
  req.session.verified[`${owner}/${repo}`] = id;
  req.user!.repo = { owner, repo, id };
  next();
}

export function callback(req: Request, res: Response) {
  request.post(
    {
      headers: {
        accept: "application/json"
      },
      url: "https://github.com/login/oauth/access_token",
      form: {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: req.query.code
      }
    },
    (err: Error, _: request.Response, body: any) => {
      if (err) {
        res.write("error");
        return;
      }

      const data = JSON.parse(body);
      const token = data["access_token"];
      const octokit = new Octokit();
      octokit.authenticate({ type: "token", token });
      octokit.users
        .getAuthenticated({})
        .then(user => {
          req.session!.token = token;
          req.session!.login = user.data.login;
          res.redirect("/");
        })
        .catch(err => {
          res.write("ERROR");
        });
    }
  );
}

const loginUrl = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${BASE_URL}/login/cb`;

export function auth(app: Application) {
  app.get("/login", (req: Request, res: Response) => res.redirect(loginUrl));
  app.get("/login/cb", callback);
}
