import { request as ghRequest } from "@octokit/request";
import { Octokit } from "@deliverybot/core";
import {
  config as getConfig,
  EnvLockStore,
  WatchStore,
  Targets,
  Watch,
} from "@deliverybot/deploybot";
import get from "lodash.get";
import { Repo } from "../auth.js";
import { timeAgoInWords, hash } from "../util.js";
import { Measure, Measurements } from "./metrics.js";
import { newDeployFileUrl, editDeployFileUrl, yamlEncode } from "../util.js";

export async function gql(token: string, query: string, variables: any) {
  const resp = await ghRequest({
    data: { query, variables },
    method: "POST",
    url: "/graphql",
    headers: {
      authorization: `token ${token}`,
      accept: "application/vnd.github.antiope-preview+json",
    },
  });
  if (resp.data.errors && resp.data.errors.length > 0) {
    throw new Error(
      `Graphql request failure: ${JSON.stringify(resp.data.errors)}`,
    );
  }
  return resp.data.data;
}

export interface Options {
  minimal?: boolean;
  before?: string;
  after?: string;
  count?: number;
}

const CommitData = ({ minimal }: Options) => `
messageHeadline oid message
author { user { login } }
${
  minimal
    ? ""
    : `
status { contexts { context state } }
checkSuites(last: 50) { nodes { conclusion status checkRuns(last: 1) { nodes { name } } } }
deployments(last: 50) {
  nodes {
    id environment description createdAt
    creator { login }
    latestStatus { logUrl state }
  }
}`
}
`;

const CommitsQuery = (opts: Options) => `
query commits(
  $owner: String!, $repo: String!, $branch: String!,
  $after: String, $before: String, $first: Int, $last: Int
) {
  repository(owner:$owner,name:$repo) {
    refs(refPrefix:"refs/heads/",first:50) { nodes { name } }
    ref(qualifiedName:$branch) {
      target {
        ... on Commit {
          history(first:$first, last:$last, before:$before, after:$after) {
            edges { node { ${CommitData(opts)} } }
            pageInfo {
              hasNextPage
              endCursor
              startCursor
              hasPreviousPage
            }
          }
        }
      }
    }
  }
}
`;

const AllDeployments = () => `
query deployments($owner:String!,$repo:String!) {
  repository(owner:$owner,name:$repo) {
    deployments(first:100,orderBy:{field:CREATED_AT,direction:DESC}) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        state environment createdAt
        latestStatus { createdAt }
        commit {
          authoredDate
          associatedPullRequests(first: 1) {
            nodes {
              createdAt
            }
          }
        }
      }
    }
  }
}
`;

const DeploymentsQuery = () => `
query deployments(
  $owner: String!, $repo: String!, $environments: [String!],
  $after: String, $before: String, $first: Int, $last: Int
) {
  repository(owner:$owner,name:$repo) {
    deployments(
      first:$first, last:$last, after:$after, before:$before,
      environments:$environments,
      orderBy:{field:CREATED_AT,direction:DESC}
    ) {
      pageInfo { hasNextPage endCursor hasPreviousPage startCursor }
      nodes {
        id environment description createdAt
        creator { login }
        ref { name }
        commit { oid messageHeadline }
        latestStatus { state logUrl environmentUrl }
      }
    }
  }
}
`;

interface Watches {
  [k: string]: Watch[];
}

async function getWatches(watch: WatchStore, repoId: number, shas: string[]) {
  return Promise.all(shas.map((sha) => watch.listWatchBySha(repoId, sha))).then(
    (watches) =>
      shas.reduce<Watches>((acc, sha, i) => {
        acc[sha] = watches[i];
        return acc;
      }, {}),
  );
}

export async function commits(
  watch: WatchStore,
  token: string,
  owner: string,
  repo: string,
  repoId: number,
  branch: string,
  opts: Options,
) {
  const variables: any = { owner, repo, branch };
  if (opts.before) {
    variables.last = opts.count;
    variables.before = opts.before;
  } else if (opts.after) {
    variables.first = opts.count;
    variables.after = opts.after;
  } else {
    variables.first = opts.count;
  }
  const result = await gql(token, CommitsQuery(opts), variables);
  const shas = get(result, "repository.ref.target.history.edges", []).map(
    (edge: any) => edge.node.oid,
  );
  const watches = await getWatches(watch, repoId, shas);

  // For generating test files:
  // require("fs").writeFileSync(`./test/fixtures/query-commits.${opts.minimal ? "minimal" : "full"}.json`, JSON.stringify(result, null, 2));
  return View(owner, repo, branch, watches, result);
}

export async function metrics(
  token: string,
  owner: string,
  repo: string,
  start: Date,
  end: Date,
) {
  const result = await gql(token, AllDeployments(), { owner, repo });
  // For generating test files:
  // require('fs').writeFileSync(`./test/fixtures/metrics.json`, JSON.stringify(result, null, 2));
  const measures = Measures(result, start, end);
  return new Measurements(start, end, measures).toJSON();
}

export interface DeploymentsOptions {
  environment?: string;
  before?: string;
  after?: string;
  count: number;
}

export async function deployments(
  token: string,
  owner: string,
  repo: string,
  opts: DeploymentsOptions,
) {
  const variables: any = { owner, repo };
  if (opts.environment) {
    variables.environments = [opts.environment];
  }
  if (opts.before) {
    variables.last = opts.count;
    variables.before = opts.before;
  } else if (opts.after) {
    variables.first = opts.count;
    variables.after = opts.after;
  } else {
    variables.first = opts.count;
  }
  const result = await gql(token, DeploymentsQuery(), variables);
  return DeploymentList(owner, repo, result);
}

export function DeploymentList(owner: string, repo: string, data: any) {
  const deployments = (
    get(data, "repository.deployments.nodes", []) as any[]
  ).map((node: any) => {
    const createdAt = Date.parse(node.createdAt);
    const sha: string = get(node, "commit.oid", "");
    return {
      id: node.id,
      environment: node.environment,
      description: node.description || "",
      status: Status(get(node, "latestStatus.state")),
      state: get(node, "latestStatus.state", "waiting").toLowerCase(),
      creator: get(node, "creator.login"),
      ref: get(node, "ref.name"),
      sha,
      shaShort: sha.substr(0, 7),
      message: get(node, "commit.messageHeadline", ""),
      commitUrl: sha && `https://github.com/${owner}/${repo}/commit/${sha}`,
      logUrl: get(node, "latestStatus.logUrl"),
      environmentUrl: get(node, "latestStatus.environmentUrl"),
      createdAt,
      createdAtWords: timeAgoInWords(createdAt),
    };
  });
  const pagination = get(data, "repository.deployments.pageInfo", {});
  return { deployments, pagination: Pagination(pagination) };
}

const EnvironmentsQuery = `
query environments($owner:String!,$repo:String!) {
  repository(owner:$owner,name:$repo) {
    environments(first:100) {
      nodes { name }
    }
  }
}
`;

const DeploymentFields = `
id environment description createdAt state
creator { login }
ref { name }
commit { oid messageHeadline }
latestStatus { state logUrl environmentUrl }
`;

// One aliased deployments connection per environment, so the active
// deployment of every environment comes back in a single request.
const ActiveDeploymentsQuery = (count: number) => `
query activeDeployments($owner:String!,$repo:String!,${Array.from(
  { length: count },
  (_, i) => `$e${i}:[String!]`,
).join(",")}) {
  repository(owner:$owner,name:$repo) {
${Array.from(
  { length: count },
  (_, i) =>
    `    e${i}: deployments(environments:$e${i},first:20,orderBy:{field:CREATED_AT,direction:DESC}) { nodes { ${DeploymentFields} } }`,
).join("\n")}
  }
}
`;

export async function environments(token: string, owner: string, repo: string) {
  const envs = await gql(token, EnvironmentsQuery, { owner, repo });
  const names: string[] = (
    get(envs, "repository.environments.nodes", []) as any[]
  )
    .map((node) => node.name)
    .sort();
  if (names.length === 0) {
    return { environments: [] };
  }
  const variables: any = { owner, repo };
  names.forEach((name, i) => (variables[`e${i}`] = [name]));
  const result = await gql(
    token,
    ActiveDeploymentsQuery(names.length),
    variables,
  );
  return EnvironmentList(owner, repo, names, result);
}

// GitHub marks the newest successful deployment of an environment ACTIVE
// and older ones INACTIVE; environments without one (torn down, or never
// deployed successfully) aren't listed.
export function EnvironmentList(
  owner: string,
  repo: string,
  names: string[],
  data: any,
) {
  const environments = names
    .map((name, i) => {
      const nodes: any[] = get(data, `repository.e${i}.nodes`, []);
      const active = nodes.find((node) => node.state === "ACTIVE");
      if (!active) return null;
      const [deployment] = DeploymentList(owner, repo, {
        repository: { deployments: { nodes: [active] } },
      }).deployments;
      // A newer deployment that hasn't become active yet, e.g. one in
      // progress or one that failed.
      const latest = nodes[0] !== active && nodes[0];
      return {
        ...deployment,
        name,
        latest: latest && {
          state: get(latest, "latestStatus.state", "waiting").toLowerCase(),
          status: Status(get(latest, "latestStatus.state")),
          createdAtWords: timeAgoInWords(Date.parse(latest.createdAt)),
        },
      };
    })
    .filter(Boolean);
  return { environments };
}

export function View(
  owner: string,
  repo: string,
  branch: string,
  watches: Watches,
  data: any,
) {
  const branches = Branches(branch, get(data, "repository.refs.nodes", []));
  const commits = Commits(
    owner,
    repo,
    branch,
    watches,
    get(data, "repository.ref.target.history.edges", []),
  );
  const pagination = get(data, "repository.ref.target.history.pageInfo", {});
  return { branches, pagination: Pagination(pagination), ...commits };
}

export function Measures(data: any, start: Date, end: Date): Measure[] {
  return get(data, "repository.deployments.nodes", [])
    .map((node: any): Measure | null => {
      const createdAt = get(node, "createdAt");
      const committedAt = get(node, "commit.authoredDate");
      const deployedAt = get(node, "latestStatus.createdAt");
      const startedAt = get(
        node,
        "associatedPullRequests[0].createdAt",
        committedAt,
      );
      const state = get(node, "state");
      const env = get(node, "environment");

      if (!createdAt || !committedAt) {
        return null;
      }
      const time = new Date(Date.parse(createdAt)).getTime();
      if (time < start.getTime() || time > end.getTime()) {
        return null;
      }

      return {
        createdAt: new Date(Date.parse(createdAt)),
        committedAt: new Date(Date.parse(committedAt)),
        deployedAt: (deployedAt && new Date(Date.parse(deployedAt))) || null,
        startedAt: (startedAt && new Date(Date.parse(startedAt))) || null,
        env,
        state,
      };
    })
    .filter((m: any) => !!m);
}

export function Pagination(pagination: any) {
  return {
    next: pagination.hasNextPage && encodeURIComponent(pagination.endCursor),
    prev:
      pagination.hasPreviousPage && encodeURIComponent(pagination.startCursor),
  };
}

const failing = ["FAILURE", "FAILING", "ERROR", "CANCELLED", "TIMED_OUT"];
const pending = ["PENDING", "ACTION_REQUIRED", "QUEUED", "IN_PROGRESS"];
const success = ["SUCCESS"];
const waiting = ["WAITING"];

export function AggregateStatus(statuses: string[]) {
  if (statuses.find((s) => failing.includes(s.toUpperCase()))) {
    return "FAILURE";
  }
  if (statuses.find((s) => pending.includes(s.toUpperCase()))) {
    return "PENDING";
  }
  if (statuses.find((s) => success.includes(s.toUpperCase()))) {
    return "SUCCESS";
  }
  if (statuses.find((s) => waiting.includes(s.toUpperCase()))) {
    return "WAITING";
  }
  return "NOTHING";
}

export function Checks(
  node: any,
): Array<{ context: string; status: ReturnType<typeof Status> }> {
  return (((node.status && node.status.contexts) || []) as any[])
    .map((ctx) => ({
      context: ctx.context as string,
      status: Status(ctx.state),
    }))
    .concat(
      (get(node, "checkSuites.nodes", []) as any)
        // If no check run exists for this checkSuite then we just simply ignore
        // this checkSuite for the time being. I believe that checkSuite's are
        // sometimes created but never 'fulfilled' which would cause this to sit
        // in a pending state forever.
        .filter((cs: any) => get(cs, "checkRuns.nodes[0]"))
        .map((cs: any) => ({
          context: get(cs, "checkRuns.nodes[0].name") as string,
          status: Status(cs.conclusion || cs.status),
        })),
    )
    .filter(
      (el, i, arr) => arr.findIndex((el2) => el2.context === el.context) == i,
    );
}

export function Check(node: any) {
  return {
    status: Status(AggregateStatus(Checks(node).map((c) => c.status.name))),
  };
}

export function Status(status?: string) {
  const s = [(status || "WAITING").toUpperCase()];
  const name = AggregateStatus(s);
  switch (AggregateStatus(s)) {
    case "FAILURE":
      return { failure: true, color: "red", name };
    case "PENDING":
      return { pending: true, color: "yellow", name };
    case "SUCCESS":
      return { success: true, color: "green", name };
    case "WAITING":
      return { waiting: true, color: "gray", name };
    default:
      return { nothing: true, color: "gray", name };
  }
}

export function Deployment(node: any) {
  const deployments = get(node, "deployments.nodes", []);
  const statuses = deployments.map((deploy: any) =>
    get(deploy, "latestStatus.state", "WAITING"),
  );
  const lastDeployedAt: number = deployments
    .map((deploy: any) => Date.parse(deploy.createdAt))
    .sort()
    .pop();
  const lastDeployedAtWords = lastDeployedAt && timeAgoInWords(lastDeployedAt);
  return {
    // Use the latest status to make a decision:
    status: Status(
      AggregateStatus([statuses[statuses.length - 1] || "NOTHING"]),
    ),
    lastDeployedAt,
    lastDeployedAtWords,
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
  return (get(node, "deployments.nodes", []) as any[])
    .map((deploy: any) => ({
      status: Status(deploy.latestStatus && deploy.latestStatus.state),
      description: truncate(deploy.description, 20),
      environment: deploy.environment,
      creator: get(deploy, "creator.login"),
      createdAt: Date.parse(deploy.createdAt),
      createdAtWords: timeAgoInWords(Date.parse(deploy.createdAt)),
      url: get(deploy, "latestStatus.logUrl"),
    }))
    .sort((a, b) => b.createdAt - a.createdAt)
    .filter(
      (el, i, arr) =>
        arr.findIndex((el2) => el2.environment === el.environment) == i,
    );
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
  const latestIdx = commits.findIndex((c) => c.oid === latest.oid);
  return commits[latestIdx + 1] || null;
}

export function Latest(commits: any[]) {
  const latest = commits
    .slice()
    .filter((c: any) => c.deployment.lastDeployedAt)
    .sort(
      (f: any, s: any) =>
        f.deployment.lastDeployedAt - s.deployment.lastDeployedAt,
    )
    .pop();
  if (latest) latest.deployment.latest = true;
  return latest;
}

export function Commits(
  owner: string,
  repo: string,
  branch: string,
  watches: Watches,
  edges: any,
) {
  const commits = edges.map((edge: any) =>
    Commit(owner, repo, branch, watches, edge),
  );
  const latest = Latest(commits);
  const previous = Previous(commits);
  return { commits, latest, previous };
}

export function DeploymentWatch(watch: Watch) {
  return {
    status: Status("WAITING"),
    description: "Waiting...",
    environment: watch.targetVal.environment,
    creator: "deliverybot",
    createdAt: Date.now(),
    createdAtWords: timeAgoInWords(Date.now()),
    url: null,
  };
}

export function Promoted(node: any) {
  return !!get(node, "status.contexts", []).find(
    (ctx: any) => ctx.context === "deliverybot/promotion",
  );
}

export function Commit(
  owner: string,
  repo: string,
  branch: string,
  watches: Watches,
  edge: any,
) {
  const watchList = watches[get(edge, "node.oid", "")] || [];
  const data = {
    owner,
    repo,
    branch,
    message: get(edge, "node.messageHeadline", ""),
    body: get(edge, "node.message"),
    oid: get(edge, "node.oid"),
    oidShort: get(edge, "node.oid", "").substr(0, 7),
    author: get(edge, "node.author.user.login"),
    undeployed: Undeployed(edge.node),
    deployment: Deployment(edge.node),
    promoted: Promoted(edge.node),
    deployments: Deployments(edge.node).concat(watchList.map(DeploymentWatch)),
    check: Check(edge.node),
    checks: Checks(edge.node),
  };
  return {
    hash: hash(data),
    ...data,
  };
}

export function Branches(
  active: string,
  branches: any[],
): Array<{ name: string; active: boolean }> {
  return branches.map((n) => ({
    name: n.name,
    active: active === n.name,
  }));
}

export function Targets(conf: Targets | null) {
  return (
    conf &&
    Object.keys(conf).map((name: string) => ({
      name,
    }))
  );
}

interface Config {
  newFileUrl: string;
  editFileUrl: string;
  notExists: boolean;
  yaml: string;
  error: Error | null;
  config: Targets | null;
}

export async function config(
  github: Octokit,
  owner: string,
  repo: string,
  branch: string,
): Promise<Config> {
  const newFileUrl = newDeployFileUrl(owner, repo, branch);
  const editFileUrl = editDeployFileUrl(owner, repo, branch);

  const conf: Config = {
    yaml: "",
    notExists: true,
    editFileUrl,
    newFileUrl,
    error: null,
    config: null,
  };
  try {
    conf.config = await getConfig(github, {
      owner,
      repo,
      ref: `refs/heads/${branch}`,
    });
    conf.yaml = yamlEncode(conf.config) || "";
    conf.notExists = false;
  } catch (e) {
    if (e.status !== 404) {
      conf.error = e;
    }
  }
  return conf;
}

export async function locks(config: Config, repo: Repo, lock: EnvLockStore) {
  const locked = await lock.list(repo.id);
  const targets = Object.keys(config.config || {}).map((target) => {
    const environment = get(config, `config.${target}.environment`, "");
    return {
      target,
      lockable: environment && !environment.includes("${{"),
      locked: locked.includes(environment),
      environment,
    };
  });
  return { any: locked.length > 0, locked, targets };
}
