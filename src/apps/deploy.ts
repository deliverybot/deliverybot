import { AuthedRequest, authenticate, verifyRepo } from "./auth";
import { Response, Application } from "express";
import { request as ghRequest } from "@octokit/request";
import { deployCommit, config } from "../handlers/commands";
import * as pkg from "../package";

export async function create(req: AuthedRequest, res: Response) {
  const { owner, repo, target, sha } = req.params;
  try {
    const deployed = await deployCommit(req.user!.github, {
      owner,
      repo,
      target,
      commit: sha
    });
    res.json({ message: "ok", sha, ...deployed.data });
  } catch (err) {
    res.status(500).json({ error: err.message })
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
    console.error(err);
    return null;
  }
}

export async function get(req: AuthedRequest, res: Response) {
  const { owner, repo, target, branch } = req.params;
  const conf = await tryConfig(req);
  const deployment = conf && conf[target];

  const query = await commitQuery(
    req.user!.token,
    owner,
    repo,
    deployment && deployment && deployment.environment
      ? [deployment.environment]
      : [],
    branch || "master"
  );
  res.render("commits", {
    target,
    targets:
      conf &&
      Object.keys(conf).map((name: string) => ({
        name,
        active: name === target
      })),
    owner,
    repo,
    pkg,
    branch,
    branches: query.branches.map(name => ({
      name,
      active: branch === name
    })),
    commits: query.commits.map(c => commitView(c))
  });
}

export async function redirect(req: AuthedRequest, res: Response) {
  const { owner, repo } = req.params;
  const conf = await tryConfig(req);
  const target = Object.keys(conf)[0] || "none";
  const branch = "master";
  res.redirect(`/deploy/${target}/${owner}/${repo}/${branch}`);
}

interface Commit {
  owner: string;
  repo: string;
  message: string;
  state: string;
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

async function commitQuery(
  token: string,
  owner: string,
  repo: string,
  environments: string[],
  branch: string
): Promise<{ commits: Commit[]; branches: string[] }> {
  const query = `query commits($owner: String!, $repo: String!, $environments: [String!]!, $branch: String!) {
    repository(owner:$owner,name:$repo) {
      refs(refPrefix:"refs/heads/",first:50) { nodes { name } }
      ref(qualifiedName:$branch) {
        target {
          ... on Commit {
            history(first: 10) {
              edges {
                node {
                  messageHeadline
                  oid
                  message
                  author { user { login } }
                  deployments(last: 1, environments: $environments) {
                    nodes {
                      id
                      environment
                      latestStatus {
                        state
                        logUrl
                      }
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
  const data = await ghRequest({
    data: { query, variables: { owner, repo, environments, branch } },
    method: "POST",
    url: "/graphql",
    headers: { authorization: `token ${token}` }
  });
  if (data.data.errors && data.data.errors.length > 0) {
    throw new Error(
      `Graphql request failure: ${JSON.stringify(data.data.errors)}`
    );
  }
  const branches = data.data.data.repository.refs.nodes.map((n: any) => n.name);
  const commits = data.data.data.repository.ref.target.history.edges.map(
    (node: any) => {
      const state = (() => {
        if (node.node.deployments.nodes.length >= 1) {
          const deploy = node.node.deployments.nodes[0];
          if (deploy.latestStatus && deploy.latestStatus.state) {
            return deploy.latestStatus.state;
          }
          return "PENDING";
        }
        return "UNDEPLOYED";
      })();
      const logUrl = (() => {
        if (node.node.deployments.nodes.length >= 1) {
          const deploy = node.node.deployments.nodes[0];
          if (deploy.latestStatus) {
            return deploy.latestStatus.logUrl;
          }
        }
      })();
      return {
        state,
        owner,
        repo,
        logUrl,
        message: node.node.messageHeadline,
        oid: node.node.oid.substr(0, 7),
        author: node.node.author.user.login
      };
    }
  );
  return { commits, branches };
}

function commitView(commit: any) {
  switch (commit.state) {
    case "PENDING":
      commit.pending = true;
      commit.color = "yellow";
      break;
    case "SUCCESS":
      commit.color = "green";
      commit.deployed = true;
      break;
    case "INACTIVE":
    case "FAILURE":
      commit.color = "red";
      commit.failure = true;
      break;
  }
  return commit;
}
