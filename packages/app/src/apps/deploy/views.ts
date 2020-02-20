import { EnvLockStore, WatchStore } from "@deliverybot/deploybot";
import { Repo, User } from "../auth";
import { hash, daysAgo, today } from "../util";
import * as queries from "./queries";

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
    branch,
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
    branch || "master",
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
