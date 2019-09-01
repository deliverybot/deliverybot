import { AuthedRequest, authenticate, verifyRepo, auth } from "./auth";
import { Response, Application } from "express";
import { deployCommit, config } from "./commands";
import * as pkg from "../package";
import * as queries from "./queries";
import hash from "object-hash";

export function deploy(app: Application) {
  app.get("/deploy/:owner/:repo", authenticate, verifyRepo, redirect);
  app.get(
    "/deploy/:target/:owner/:repo/:branch",
    authenticate,
    verifyRepo,
    index
  );
  app.get(
    "/deploy/:target/:owner/:repo/:branch/:sha",
    authenticate,
    verifyRepo,
    show
  );
  app.post(
    "/deploy/:target/:owner/:repo/:branch/:sha",
    authenticate,
    verifyRepo,
    create
  );
}

export async function show(req: AuthedRequest, res: Response) {
  const { owner, repo, target, branch, sha } = req.params;
  const conf = await tryConfig(req);
  const targets = queries.Targets(target, conf);

  const commit = await queries.commit(
    req.user!.token,
    owner,
    repo,
    target,
    branch,
    sha
  );
  if (req.headers["accept"] === "application/json") {
    res.json(ctx(req, commit));
  } else {
    res.render("commit", ctx(req, { targets, ...commit }));
  }
}

export async function create(req: AuthedRequest, res: Response) {
  const { owner, repo, target, branch, sha } = req.params;
  const conf = await tryConfig(req);
  const targets = queries.Targets(target, conf);

  try {
    await deployCommit(req.user!.github, (req as any).log, {
      owner,
      repo,
      target,
      sha,
      // Don't want to specify the branch here otherwise we'll deploy the head
      // instead of the current commit.
      ref: sha,
    });
    res.redirect(`/deploy/${target}/${owner}/${repo}/${branch}/${sha}`)
  } catch (error) {
    const commit = await queries.commit(
      req.user!.token,
      owner,
      repo,
      target,
      branch,
      sha
    );
    res.render("commit", ctx(req, { error, targets, ...commit }));
  }
}

export async function index(req: AuthedRequest, res: Response) {
  const { owner, repo, target, branch } = req.params;
  const conf = await tryConfig(req);
  const targets = queries.Targets(target, conf);

  const { branches, commits } = await queries.commits(
    req.user!.token,
    owner,
    repo,
    target,
    branch || "master"
  );
  if (req.headers["accept"] === "application/json") {
    res.json(ctx(req, ctx(req, { branches, commits, targets })));
  } else {
    res.render("deploy", ctx(req, { branches, commits, targets }));
  }
}

export async function redirect(req: AuthedRequest, res: Response) {
  const { owner, repo } = req.params;
  const conf = await tryConfig(req);
  const target = Object.keys(conf || {})[0] || "none";
  const branch = "master";
  res.redirect(`/deploy/${target}/${owner}/${repo}/${branch}`);
}

function ctx(req: AuthedRequest, data: any) {
  const { owner, repo, target, branch, sha } = req.params;
  const repoId = req.user!.repo!.id;
  const out = {
    repoId,
    owner,
    repo,
    target,
    branch,
    sha,
    oid: sha,
    pkg,
    ...data
  };
  return { csrf: req.csrfToken(), hash: hash(out), ...out };
}

async function tryConfig(req: AuthedRequest) {
  const { owner, repo, branch } = req.params;
  try {
    return await config(req.user!.github, {
      owner,
      repo,
      ref: branch ? `refs/heads/${branch}` : `refs/heads/master`
    });
  } catch (err) {
    return null;
  }
}
