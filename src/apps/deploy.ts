import { AuthedRequest, authenticate, verifyRepo, auth } from "./auth";
import { Response, Application } from "express";
import { deployCommit, config } from "./commands";
import * as pkg from "../package";
import * as queries from "./queries";
import hash from "object-hash";
import { newDeployFileUrl } from "../util";

export function deploy(app: Application) {
  const baseUrl = "/:owner/:repo";
  const indexUrl = `${baseUrl}/target/:target/branch/:branch`;
  const commitUrl = `${indexUrl}/o/:sha`;

  app.get(baseUrl, authenticate, verifyRepo, redirect);
  app.get(indexUrl, authenticate, verifyRepo, index);
  app.get(commitUrl, authenticate, verifyRepo, show);
  app.post(commitUrl, authenticate, verifyRepo, create);
}

function watch(req: AuthedRequest, page: string) {
  return {
    watch: true,
    page,
    repo: {
      owner: req.user!.repo!.owner,
      repo: req.user!.repo!.owner,
      repoId: req.user!.repo!.id
    }
  };
}

export async function show(req: AuthedRequest, res: Response) {
  const { owner, repo, target, branch, sha } = req.params;
  if (req.query.watch) {
    res.json(watch(req, "commit"));
    return;
  }

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
  const data = { targets, ...commit };
  if (req.headers["accept"] === "application/json") {
    res.json(ctx(req, data));
  } else {
    res.render("commit", ctx(req, data));
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
      ref: sha
    });
    res.redirect(
      `/${owner}/${repo}/target/${target}/branch/${branch}/o/${sha}`
    );
  } catch (error) {
    const commit = await queries.commit(
      req.user!.token,
      owner,
      repo,
      target,
      branch,
      sha
    );
    res.render(
      "commit",
      ctx(req, { page: "commit", error, targets, ...commit })
    );
  }
}

export async function index(req: AuthedRequest, res: Response) {
  const { owner, repo, target, branch } = req.params;
  const conf = await tryConfig(req);
  const targets = queries.Targets(target, conf);
  if (req.query.watch) {
    res.json(watch(req, "commits"));
    return;
  }

  const result = await queries.commits(
    req.user!.token,
    owner,
    repo,
    target,
    branch || "master"
  );
  const fileUrl = newDeployFileUrl(owner, repo);
  const data = {
    page: "commits",
    noConfig: !conf,
    fileUrl,
    targets,
    ...result
  };
  if (req.headers["accept"] === "application/json") {
    res.json(ctx(req, ctx(req, data)));
  } else {
    res.render("commits", ctx(req, data));
  }
}

export async function redirect(req: AuthedRequest, res: Response) {
  const { owner, repo } = req.params;
  const conf = await tryConfig(req);
  const target =
    conf && conf.production
      ? "production"
      : Object.keys(conf || {})[0] || "none";
  const branch = "master";
  res.redirect(`/${owner}/${repo}/target/${target}/branch/${branch}`);
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
