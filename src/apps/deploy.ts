import { AuthedRequest, authenticate, verifyRepo } from "./auth";
import { Response, Application } from "express";
import { request as ghRequest } from "@octokit/request";
import { deployCommit, config } from "../handlers/commands";
import * as pkg from "../package";

export async function create(req: AuthedRequest, res: Response) {
  const { owner, repo, target, sha } = req.params;
  await deployCommit(req.user!.github, owner, repo, target, sha);
  res.json({ message: "ok", sha });
}

export async function get(req: AuthedRequest, res: Response) {
  const { owner, repo, target, branch } = req.params;
  const deployment = await config(req.user!.github, owner, repo, target);
  const query = await commitQuery(
    req.user!.token,
    owner,
    repo,
    deployment.environment || "production",
    branch || "master",
  );
  res.render("commits", {
    target,
    targets: deployment.targets.map((name: string) => ({
      name,
      active: name === target
    })),
    owner,
    repo,
    pkg,
    branch,
    branches: query.branches.map(name => ({
      name,
      active: branch === name,
    })),
    commits: query.commits.map(c => commitView(c))
  });
}

export function redirect(req: AuthedRequest, res: Response) {
  const { owner, repo } = req.params;
  const target = "production";
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
  app.get("/deploy/:target/:owner/:repo/:branch", authenticate, verifyRepo, get);
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
  environment: string,
  branch: string,
): Promise<{ commits: Commit[], branches: string[] }> {
  const query = `query commits($owner: String!, $repo: String!, $environment: String!, $branch: String!) {
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
                  deployments(last: 1, environments: [$environment]) {
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
    data: { query, variables: { owner, repo, environment, branch } },
    method: "POST",
    url: "/graphql",
    headers: { authorization: `token ${token}` }
  });
  const branches = data.data.data.repository.refs.nodes.map((n: any) => n.name)
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
