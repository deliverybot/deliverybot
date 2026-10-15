import { EnvLockStore, WatchStore } from "@deliverybot/deploybot";
import { Repo, User } from "../auth.js";
import { hash, daysAgo, today } from "../util.js";
import * as queries from "./queries.js";

interface BaseProps {
  user: User;
  repo: Repo;
  branch: string;
  csrf: string;
  path: string;
  lock: EnvLockStore;
}

async function Base(
  { csrf, path, user, repo, branch, lock }: BaseProps,
  data: any,
) {
  const config = await queries.config(
    user.github,
    repo.owner,
    repo.repo,
    branch || repo.defaultBranch,
  );
  const targets = queries.Targets(config.config);
  const locking = await queries.locks(config, repo, lock);

  const out = {
    url: { path },
    user: {
      id: user.id,
      login: user.username,
      avatar: user.avatar,
    },
    repoId: repo.id,
    owner: repo.owner,
    repo: repo.repo,
    config,
    targets,
    branch,
    locking,
    ...data,
  };
  return { csrf, hash: hash(out), ...out };
}

export interface CommitsProps extends BaseProps {
  options: queries.Options;
  watch: WatchStore;
}

export async function Commits({
  watch,
  csrf,
  path,
  options,
  repo,
  branch,
  user,
  lock,
}: CommitsProps) {
  const result = await queries.commits(
    watch,
    user.token,
    repo.owner,
    repo.repo,
    repo.id,
    branch || repo.defaultBranch,
    options,
  );

  return Base(
    { csrf, path, user, repo, branch, lock },
    {
      title: `${repo.owner}/${repo.repo}`,
      page: "commits",
      ...result,
      ...options,
    },
  );
}

export async function Environments({
  csrf,
  path,
  repo,
  user,
  lock,
}: BaseProps) {
  const { environments } = await queries.environments(
    user.token,
    repo.owner,
    repo.repo,
  );
  return Base(
    { csrf, path, user, repo, branch: "", lock },
    {
      title: `${repo.owner}/${repo.repo} environments`,
      environments: environments.map((env: any) => ({
        ...env,
        deploymentsUrl: `/${repo.owner}/${repo.repo}/deployments?environment=${encodeURIComponent(env.name)}`,
      })),
      hasEnvironments: environments.length > 0,
    },
  );
}

export interface DeploymentsProps extends BaseProps {
  options: queries.DeploymentsOptions;
}

export async function Deployments({
  csrf,
  path,
  options,
  repo,
  user,
  lock,
}: DeploymentsProps) {
  const { deployments, pagination } = await queries.deployments(
    user.token,
    repo.owner,
    repo.repo,
    options,
  );
  const environment = options.environment || "";
  const link = (params: { [k: string]: string }) => {
    const query = new URLSearchParams(params);
    if (environment) query.set("environment", environment);
    const qs = query.toString();
    return qs ? `${path}?${qs}` : path;
  };
  const out = await Base(
    { csrf, path, user, repo, branch: "", lock },
    {
      title: `${repo.owner}/${repo.repo} deployments`,
      deployments,
      hasDeployments: deployments.length > 0,
      pagination: {
        // Cursors from Pagination() are already URI encoded.
        prev:
          pagination.prev &&
          link({ before: decodeURIComponent(pagination.prev) }),
        next:
          pagination.next &&
          link({ after: decodeURIComponent(pagination.next) }),
      },
    },
  );
  // Offer the environments from the deploy config as filters. Templated ones
  // only resolve at deploy time, so they can't be listed here.
  const names: string[] = out.locking.targets
    .filter((t: any) => t.lockable)
    .map((t: any) => t.environment as string);
  if (environment) names.push(environment);
  const environments = names
    .filter((name, i) => names.indexOf(name) === i)
    .sort()
    .map((name) => ({
      name,
      url: `${path}?environment=${encodeURIComponent(name)}`,
    }));
  return { ...out, environment, environments };
}

export interface CommitProps extends BaseProps {
  error?: any;
  sha: string;
  options: queries.Options;
  watch: WatchStore;
}

export async function Config(props: BaseProps) {
  return Base(props, {
    title: `${props.repo.owner}/${props.repo.repo} config`,
  });
}

export interface MetricsProps extends BaseProps {
  minimal: boolean;
}

export async function Metrics({
  csrf,
  path,
  repo,
  branch,
  user,
  minimal,
  lock,
}: MetricsProps) {
  let metrics: any = null;
  if (!minimal) {
    metrics = await queries.metrics(
      user.token,
      repo.owner,
      repo.repo,
      daysAgo(today(), 7),
      today(),
    );
  }
  return Base(
    { lock, csrf, path, user, repo, branch },
    {
      title: `${repo.owner}/${repo.repo} metrics`,
      metrics,
    },
  );
}

export function Watch(repo: Repo, page: string) {
  return {
    watch: true,
    page,
    repo: { ...repo, repoId: repo.id },
  };
}
