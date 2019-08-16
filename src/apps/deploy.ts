import { AuthedRequest, authenticate, verifyRepo } from "./auth";
import { Response, Application } from "express";
import { request as ghRequest } from "@octokit/request";
import { deployCommit, config, Targets } from "./commands";
import * as pkg from "../package";

export async function create(req: AuthedRequest, res: Response) {
  const { owner, repo, target, sha } = req.params;
  try {
    const deployed = await deployCommit(req.user!.github, (req as any).log, {
      owner,
      repo,
      target,
      sha,
      // TODO: Change to the branch here as well so that we can query by branch
      // later on.
      ref: sha
    });
    res.json({ message: "ok", sha, ...deployed.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

export async function get(req: AuthedRequest, res: Response) {
  const { owner, repo, target, branch } = req.params;
  const conf = await tryConfig(req);
  const targets = Targets(target, conf);

  const { branches, commits } = await commitQuery(
    req.user!.token,
    owner,
    repo,
    branch || "master"
  );
  const params = {
    target,
    targets,
    owner,
    repo,
    pkg,
    branch,
    branches,
    commits
  };
  res.render("deploy", params);
}

export async function redirect(req: AuthedRequest, res: Response) {
  const { owner, repo } = req.params;
  const conf = await tryConfig(req);
  const target = Object.keys(conf || {})[0] || "none";
  const branch = "master";
  res.redirect(`/deploy/${target}/${owner}/${repo}/${branch}`);
}

export function deploy(app: Application) {
  app.get("/:owner/:repo", authenticate, verifyRepo, redirect);
  app.get("/deploy/:owner/:repo", authenticate, verifyRepo, redirect);
  app.get(
    "/deploy/:target/:owner/:repo/:branch",
    authenticate,
    verifyRepo,
    get
  );
  app.post(
    "/deploy/:target/:owner/:repo/:sha",
    authenticate,
    verifyRepo,
    create
  );
}

const query = `
query commits(
  $owner: String!, $repo: String!, $branch: String!
) {
  repository(owner:$owner,name:$repo) {
    refs(refPrefix:"refs/heads/",first:50) { nodes { name } }
    ref(qualifiedName:$branch) {
      target {
        ... on Commit {
          history(first: 10) {
            edges {
              node {
                messageHeadline oid message
                author { user { login } }
                status { contexts { state } }
                checkSuites(last: 50) { nodes { conclusion status } }
                deployments(last: 50) {
                  nodes {
                    id environment
                    creator { login }
                    latestStatus { logUrl state }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`;

async function commitQuery(
  token: string,
  owner: string,
  repo: string,
  branch: string
) {
  const resp = await ghRequest({
    data: { query, variables: { owner, repo, branch } },
    method: "POST",
    url: "/graphql",
    headers: {
      authorization: `token ${token}`,
      accept: "application/vnd.github.antiope-preview+json"
    }
  });
  if (resp.data.errors && resp.data.errors.length > 0) {
    throw new Error(
      `Graphql request failure: ${JSON.stringify(resp.data.errors)}`
    );
  }
  return View(owner, repo, branch, resp.data.data);
}

export function View(owner: string, repo: string, branch: string, data: any) {
  const branches = Branches(branch, data.repository.refs.nodes);
  const commits = data.repository.ref.target.history.edges.map((edge: any) =>
    Commit(owner, repo, edge)
  );
  return { commits, branches };
}

const failing = ["FAILURE", "FAILING", "ERROR", "CANCELLED", "TIMED_OUT"];
const pending = ["PENDING", "ACTION_REQUIRED", "QUEUED", "IN_PROGRESS"];
const success = ["SUCCESS"];

function AggregateStatus(statuses: string[]) {
  if (statuses.find(s => failing.includes(s.toUpperCase()))) {
    return "FAILURE";
  }
  if (statuses.find(s => pending.includes(s.toUpperCase()))) {
    return "PENDING";
  }
  if (statuses.find(s => success.includes(s.toUpperCase()))) {
    return "SUCCESS";
  }
  return "WAITING";
}

function Check(node: any) {
  const statuses: string[] = ((node.status && node.status.contexts) || [])
    .map((ctx: any) => ctx.state)
    .concat(
      node.checkSuites.nodes.map((cs: any) => cs.conclusion || cs.status)
    );
  return { status: Status(AggregateStatus(statuses)) };
}

function Status(status?: string) {
  const s = [(status || "WAITING").toUpperCase()];
  switch (AggregateStatus(s)) {
    case "FAILURE":
      return { failure: true, color: "red" };
    case "PENDING":
      return { pending: true, color: "yellow" };
    case "SUCCESS":
      return { success: true, color: "green" };
    default:
      return { waiting: true, color: "gray" };
  }
}

function Deployment(node: any) {
  const statuses = (node.deployments || []).nodes.map(
    (deploy: any) =>
      (deploy.latestStatus && deploy.latestStatus.state) || "WAITING"
  );
  return { status: Status(AggregateStatus(statuses)) };
}

function Undeployed(node: any) {
  const deployment = Deployment(node)
  const check = Check(node)
  if (check.status.success && deployment.status.waiting) {
    return true
  }
  return false
}

function Deployments(node: any) {
  return (node.deployments || []).nodes.map((deploy: any) => ({
    status: Status(deploy.latestStatus && deploy.latestStatus.state),
    environment: deploy.environment,
    creator: deploy.creator.login,
    url: deploy.latestStatus && deploy.latestStatus.logUrl
  }));
}

function Commit(owner: string, repo: string, edge: any) {
  return {
    owner,
    repo,
    message: edge.node.messageHeadline,
    oid: edge.node.oid.substr(0, 7),
    author: edge.node.author.user.login,
    undeployed: Undeployed(edge.node),
    deployment: Deployment(edge.node),
    deployments: Deployments(edge.node),
    check: Check(edge.node)
  };
}

function Branches(
  active: string,
  branches: any[]
): Array<{ name: string; active: boolean }> {
  return branches.map(n => ({
    name: n.name,
    active: active === n.name
  }));
}

function Targets(target: string, conf: Targets | null) {
  return (
    conf &&
    Object.keys(conf).map((name: string) => ({
      name,
      active: name === target
    }))
  );
}
