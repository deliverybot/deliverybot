import { Dependencies, Octokit } from "@deliverybot/core";
import { Response, Request, NextFunction } from "express";

export interface Repo {
  owner: string;
  repo: string;
  id: number;
  defaultBranch: string;
}
export interface User {
  id: string;
  username: string;
  token: string;
  avatar: string;
  github: Octokit;
  repo?: Repo;
}

export interface AuthedRequest extends Request {
  user?: User;
}

export function setUser(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.session.token;
  if (!token) {
    return next();
  }
  const { userId: id, avatar, login: username } = req.session;
  if (!id || !username) {
    return next();
  }
  const github = new Octokit({ auth: token });
  req.user = { id, avatar: avatar || "", github, token, username };
  next();
}

export function authenticate(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  const token = req.session.token;
  if (!token) {
    (req as any).log.info("unauthenticated access redirecting");
    req.session.next = req.url;
    res.redirect("/login");
    return;
  }
  setUser(req, res, next);
}

export async function canWrite(
  gh: Octokit,
  { owner, repo, username }: { owner: string; repo: string; username: string },
): Promise<boolean> {
  const perms = await gh.rest.repos.getCollaboratorPermissionLevel({
    owner,
    repo,
    username,
  });
  return ["admin", "write"].includes(perms.data.permission);
}

export async function verifyRepo(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  const { owner, repo } = req.params;
  const username = req.user!.username;
  const octokit = req.user!.github;
  const verified = req.session.verified?.[`${owner}/${repo}`];
  // Sessions from before the default branch was stored hold only the id.
  if (typeof verified === "object") {
    req.user!.repo = { owner, repo, ...verified };
    next();
    return;
  }

  const repoData = await octokit.rest.repos.get({ owner, repo });
  const id = repoData.data.id;
  const defaultBranch = repoData.data.default_branch;
  const write = await canWrite(octokit, { owner, repo, username });
  if (!write) {
    (req as any).log.info({ owner, repo }, "no write access");
    res.redirect("/login");
    return;
  }
  req.session.verified = req.session.verified || {};
  req.session.verified[`${owner}/${repo}`] = { id, defaultBranch };
  req.user!.repo = { owner, repo, id, defaultBranch };
  next();
}

/**
 * Auth initiates the auth application.
 *
 * Config:
 * - githubClientId
 * - githubClientSecret
 * - baseUrl
 */
export function auth({ app, csrf, userService, config }: Dependencies) {
  const loginUrl = `https://github.com/login/oauth/authorize?scope=user&client_id=${config.githubClientId}&redirect_uri=${config.baseUrl}/login/cb`;

  async function accessToken(code: string): Promise<{
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  }> {
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
    return resp.json();
  }

  async function callback(req: Request, res: Response) {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const grant = code ? await accessToken(code) : {};
    const token = grant.access_token;
    if (!token) {
      res.redirect("/login");
      return;
    }

    const octokit = new Octokit({ auth: token });
    const user = await octokit.rest.users.getAuthenticated({});

    // A fresh session id on sign in prevents session fixation.
    const { next, slackId } = req.session;
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((err) => (err ? reject(err) : resolve())),
    );
    req.session.avatar = user.data.avatar_url;
    req.session.token = token;
    // GitHub App user tokens expire unless the app opts out. The Slack app
    // keeps the refresh token so commands keep working after that.
    if (grant.refresh_token) req.session.refreshToken = grant.refresh_token;
    if (grant.expires_in) {
      req.session.tokenExpiresAt = Date.now() + grant.expires_in * 1000;
    }
    req.session.userId = `${user.data.id}`;
    req.session.login = user.data.login;
    if (slackId) req.session.slackId = slackId;
    await recordUser(req);
    res.set("csrf-token", req.csrfToken());
    const url = next || "/";
    res.redirect(url);
  }

  // Records the signed in user once per session, so sessions from before
  // sign ins were recorded show up too.
  async function recordUser(req: Request) {
    const { userId, login } = req.session;
    if (!userId || !login) return;
    await userService().update({ id: userId, username: login, email: "" });
    req.session.userRecorded = true;
  }

  app.use(async (req: Request, res: Response, next: NextFunction) => {
    if (req.session?.token && !req.session.userRecorded) {
      try {
        await recordUser(req);
      } catch (error) {
        req.log.warn({ error }, "could not record user");
      }
    }
    next();
  });

  app.get("/login", (req: Request, res: Response) => res.redirect(loginUrl));
  app.get("/login/cb", csrf, callback);
  app.get("/_/me", setUser, (req: AuthedRequest, res: Response) => {
    res.json({ id: req.user ? req.user.id : null });
  });
  app.post(
    "/logout/remove",
    csrf,
    setUser,
    async (req: AuthedRequest, res: Response) => {
      const user = req.user;
      if (user) {
        await userService().delete(`${user.id}`);
      }
      req.session.destroy(() => res.redirect("https://deliverybot.dev"));
    },
  );
  app.get("/logout", (req: Request, res: Response) => {
    req.session.destroy(() => res.redirect("https://deliverybot.dev"));
  });
}
