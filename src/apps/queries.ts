import { request as ghRequest } from "@octokit/request";
import { Targets } from "./commands";

async function gql(token: string, query: string, variables: any) {
  const resp = await ghRequest({
    data: { query, variables },
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
  return resp.data.data;
}

const CommitData = `
messageHeadline oid message
author { user { login } }
status { contexts { state } }
checkSuites(last: 50) { nodes { conclusion status } }
deployments(last: 50) {
  nodes {
    id environment description
    creator { login }
    latestStatus { logUrl state }
  }
}
`;

const CommitQuery = `
query commit(
  $owner: String!, $repo: String!, $oid: GitObjectID
) {
  repository(owner:$owner,name:$repo) {
    node: object(oid: $oid) {
      ... on Commit { ${CommitData} }
    }
  }
}
`;

const CommitsQuery = `
query commits(
  $owner: String!, $repo: String!, $branch: String!
) {
  repository(owner:$owner,name:$repo) {
    refs(refPrefix:"refs/heads/",first:50) { nodes { name } }
    ref(qualifiedName:$branch) {
      target {
        ... on Commit { history(first: 10) { edges { node { ${CommitData} }}}}
      }
    }
  }
}
`;

export async function commits(
  token: string,
  owner: string,
  repo: string,
  target: string,
  branch: string
) {
  const result = await gql(token, CommitsQuery, { owner, repo, branch });
  return View(owner, repo, target, branch, result);
}

export async function commit(
  token: string,
  owner: string,
  repo: string,
  target: string,
  branch: string,
  oid: string
) {
  const result = await gql(token, CommitQuery, { owner, repo, oid });
  return Commit(owner, repo, target, branch, result.repository);
}

export function View(
  owner: string,
  repo: string,
  target: string,
  branch: string,
  data: any
) {
  const branches = Branches(branch, data.repository.refs.nodes);
  const commits = data.repository.ref.target.history.edges.map((edge: any) =>
    Commit(owner, repo, target, branch, edge)
  );
  return { commits, branches };
}

const failing = ["FAILURE", "FAILING", "ERROR", "CANCELLED", "TIMED_OUT"];
const pending = ["PENDING", "ACTION_REQUIRED", "QUEUED", "IN_PROGRESS"];
const success = ["SUCCESS"];
const waiting = ["WAITING"];

export function AggregateStatus(statuses: string[]) {
  if (statuses.find(s => failing.includes(s.toUpperCase()))) {
    return "FAILURE";
  }
  if (statuses.find(s => pending.includes(s.toUpperCase()))) {
    return "PENDING";
  }
  if (statuses.find(s => success.includes(s.toUpperCase()))) {
    return "SUCCESS";
  }
  if (statuses.find(s => waiting.includes(s.toUpperCase()))) {
    return "WAITING";
  }
  return "WAITING";
}

export function Check(node: any) {
  const statuses: string[] = ((node.status && node.status.contexts) || [])
    .map((ctx: any) => ctx.state)
    .concat(
      node.checkSuites.nodes.map((cs: any) => cs.conclusion || cs.status)
    );
  return { status: Status(AggregateStatus(statuses)) };
}

export function Status(status?: string) {
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

export function Deployment(node: any) {
  const statuses = (node.deployments || []).nodes.map(
    (deploy: any) =>
      (deploy.latestStatus && deploy.latestStatus.state) || "WAITING"
  );
  return { status: Status(AggregateStatus(statuses)) };
}

export function Undeployed(node: any) {
  const deployment = Deployment(node);
  const check = Check(node);
  if (check.status.success && deployment.status.waiting) {
    return true;
  }
  return false;
}

export function Deployments(node: any) {
  return (node.deployments || []).nodes.map((deploy: any) => ({
    status: Status(deploy.latestStatus && deploy.latestStatus.state),
    description: truncate(deploy.description, 20),
    environment: deploy.environment,
    creator: deploy.creator.login,
    url: deploy.latestStatus && deploy.latestStatus.logUrl
  }));
}

function truncate(s: string | undefined | null, t: number) {
  if (!s) {
    return ""
  }
  if (s.length > t) {
    return s.substr(0, t) + "..."
  }
  return s
}

export function Commit(
  owner: string,
  repo: string,
  target: string,
  branch: string,
  edge: any
) {
  return {
    owner,
    repo,
    target,
    branch,
    message: edge.node.messageHeadline,
    oid: edge.node.oid,
    oidShort: edge.node.oid.substr(0, 7),
    author: edge.node.author.user.login,
    undeployed: Undeployed(edge.node),
    deployment: Deployment(edge.node),
    deployments: Deployments(edge.node),
    check: Check(edge.node)
  };
}

export function Branches(
  active: string,
  branches: any[]
): Array<{ name: string; active: boolean }> {
  return branches.map(n => ({
    name: n.name,
    active: active === n.name
  }));
}

export function Targets(target: string, conf: Targets | null) {
  return (
    conf &&
    Object.keys(conf).map((name: string) => ({
      name,
      active: name === target
    }))
  );
}
