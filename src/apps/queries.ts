import { request as ghRequest } from "@octokit/request";
import { Targets } from "./commands";
import get from "lodash/get";
import moment from "moment";

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

interface Options {
  minimal?: boolean;
}

const CommitData = ({ minimal }: Options) => `
messageHeadline oid message
author { user { login } }
${
  minimal
    ? ""
    : `
status { contexts { state } }
checkSuites(last: 50) { nodes { conclusion status } }
deployments(last: 50) {
  nodes {
    id environment description createdAt
    creator { login }
    latestStatus { logUrl state }
  }
}`
}
`;

const CommitQuery = (opts: Options) => `
query commit(
  $owner: String!, $repo: String!, $oid: GitObjectID
) {
  repository(owner:$owner,name:$repo) {
    node: object(oid: $oid) {
      ... on Commit { ${CommitData(opts)} }
    }
  }
}
`;

const CommitsQuery = (opts: Options) => `
query commits(
  $owner: String!, $repo: String!, $branch: String!
) {
  repository(owner:$owner,name:$repo) {
    refs(refPrefix:"refs/heads/",first:50) { nodes { name } }
    ref(qualifiedName:$branch) {
      target {
        ... on Commit { history(first: 10) { edges { node { ${CommitData(
          opts
        )} }}}}
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
  branch: string,
  opts: Options
) {
  const result = await gql(token, CommitsQuery(opts), { owner, repo, branch });
  return View(owner, repo, target, branch, result);
}

export async function commit(
  token: string,
  owner: string,
  repo: string,
  target: string,
  branch: string,
  oid: string,
  opts: Options
) {
  const result = await gql(token, CommitQuery(opts), { owner, repo, oid });
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
  const commits = Commits(
    owner,
    repo,
    target,
    branch,
    data.repository.ref.target.history.edges
  );
  return { branches, ...commits };
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
  return "NOTHING";
}

export function Check(node: any) {
  const statuses: string[] = ((node.status && node.status.contexts) || [])
    .map((ctx: any) => ctx.state)
    .concat(
      get(node, "checkSuites.nodes", []).map(
        (cs: any) => cs.conclusion || cs.status
      )
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
    case "WAITING":
      return { waiting: true, color: "gray" };
    default:
      return { nothing: true, color: "gray" };
  }
}

export function Deployment(node: any) {
  const deployments = get(node, "deployments.nodes", []);
  const statuses = deployments.map((deploy: any) =>
    get(deploy, "latestStatus.state", "WAITING")
  );
  const lastDeployedAt = deployments
    .map((deploy: any) => Date.parse(deploy.createdAt))
    .sort()
    .pop();
  const lastDeployedAtWords =
    lastDeployedAt && moment(lastDeployedAt).fromNow();
  return {
    // Use the latest status to make a decision:
    status: Status(AggregateStatus([statuses[statuses.length-1] || "NOTHING"])),
    lastDeployedAt,
    lastDeployedAtWords
  };
}

export function Undeployed(node: any) {
  const deployment = Deployment(node);
  const check = Check(node);
  if (
    check.status.success &&
    (deployment.status.nothing || deployment.status.waiting)
  ) {
    return true;
  }
  return false;
}

export function Deployments(node: any) {
  return get(node, "deployments.nodes", []).map((deploy: any) => ({
    status: Status(deploy.latestStatus && deploy.latestStatus.state),
    description: truncate(deploy.description, 20),
    environment: deploy.environment,
    creator: deploy.creator.login,
    createdAt: Date.parse(deploy.createdAt),
    createdAtWords: moment(Date.parse(deploy.createdAt)).fromNow(),
    url: deploy.latestStatus && deploy.latestStatus.logUrl
  }));
}

function truncate(s: string | undefined | null, t: number) {
  if (!s) {
    return "";
  }
  if (s.length > t) {
    return s.substr(0, t) + "...";
  }
  return s;
}

export function Previous(commits: any[]) {
  const latest = Latest(commits);
  if (!latest) {
    return null;
  }
  const latestIdx = commits.findIndex(c => c.oid === latest.oid);
  return commits[latestIdx + 1] || null;
}

export function Latest(commits: any[]) {
  const latest = commits
    .slice()
    .filter((c: any) => c.deployment.lastDeployedAt)
    .sort(
      (f: any, s: any) =>
        f.deployment.lastDeployedAt - s.deployment.lastDeployedAt
    )
    .pop();
  if (latest) latest.deployment.latest = true;
  return latest;
}

export function Commits(
  owner: string,
  repo: string,
  target: string,
  branch: string,
  edges: any
) {
  const commits = edges.map((edge: any) =>
    Commit(owner, repo, target, branch, edge)
  );
  const latest = Latest(commits);
  const previous = Previous(commits);
  return { commits, latest, previous };
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
