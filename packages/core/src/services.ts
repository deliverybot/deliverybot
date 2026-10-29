export interface Services {
  lockService: LockService;
  kvService: KVService;
  messageService: MessageService;
  userService: UserService;
  installationService: InstallationService;
}

export type LockService = () => LockStore;
export type KVService = <T>() => KVStore<T>;
export type MessageService = <T>() => MessageBus<T>;
export type UserService = () => UserStore;
export type InstallationService = () => InstallationStore;

export class LockError extends Error {
  status = "LockError";
  retryable = true;
}

export class UnimplementedError extends Error {
  status = "UnimplementedError";
  retryable = false;
}

export interface KVStore<T> {
  put(key: string, val: T): Promise<void>;
  get(key: string): Promise<T | undefined>;
  del(key: string): Promise<void>;
  /** Deletes every key that starts with `prefix`. */
  delPrefix(prefix: string): Promise<void>;
  list(prefix: string): Promise<T[]>;
}

export interface LockStore {
  lock(key: string, handler: () => {}): Promise<void>;
}

export interface MessageBus<T> {
  subscribe(topic: string, user: { id: string }): Promise<string | undefined>;
  poll(topic: string, user: { id: string }): Promise<void>;
  publish(topic: string, message: T): Promise<void>;
}

export interface User {
  id: string;
  username: string;
  email: string;
  createdAt?: string;
}

/** A dashboard user, with when they first and last signed in. */
export interface UserRecord extends User {
  createdAt: string;
  updatedAt: string;
}

/** A repository a user opened in the dashboard. */
export interface RepositoryVisit {
  /** GitHub's repository id, so a rename doesn't leave a stale entry. */
  id: number;
  fullName: string;
  visitedAt: string;
}

export interface UserStore {
  update(user: User): Promise<User>;
  /** Deletes the user and their repository visits. */
  delete(id: string): Promise<void>;
  /** Every user, most recently signed in first. */
  list(): Promise<UserRecord[]>;
  /** Records that a user opened a repository, keeping its latest name. */
  recordVisit(
    userId: string,
    repo: Omit<RepositoryVisit, "visitedAt">,
  ): Promise<void>;
  /** The repositories a user opened last, most recent first. */
  recentVisits(userId: string, limit: number): Promise<RepositoryVisit[]>;
}

/**
 * A GitHub App installation on a user or organization account. Each one is
 * a tenant of Deliverybot.
 */
export interface Installation {
  id: number;
  account: string;
  accountType: string;
  repositorySelection: string;
  suspended: boolean;
}

export interface InstallationRecord extends Installation {
  /** Repositories the app can access, or null until first counted. */
  repositoryCount: number | null;
  /** The most recent webhook event for any of its repositories. */
  lastActivityAt: string | null;
  /** When every repository was last checked for a deploy config. */
  configsSyncedAt: string | null;
  /** Repositories with a deploy config. */
  configuredCount: number;
  createdAt: string;
  updatedAt: string;
}

/** The last webhook event Deliverybot received for a repository. */
export interface RepositoryActivity {
  id: number;
  installationId: number;
  fullName: string;
  lastEvent: string;
  lastEventAt: string;
}

/** A repository with a deploy config on its default branch. */
export interface ConfiguredRepository {
  id: number;
  /** GraphQL node id, which survives renames and transfers. */
  nodeId: string;
  fullName: string;
}

/** A deployment Deliverybot created, kept for the admin dashboard. */
export interface Deployment {
  /** GitHub's deployment id. */
  id: number;
  installationId: number;
  repositoryId: number;
  fullName: string;
  environment: string;
  /** The latest deployment status, or "pending" before the first one. */
  state: string;
  createdAt: string;
}

/** Deployments created since a point in time. */
export interface DeploymentCounts {
  total: number;
  succeeded: number;
  /** Deployments whose status is failure or error. */
  failed: number;
  repositories: number;
  installations: number;
}

/** Deployments created on one UTC day, as `YYYY-MM-DD`. */
export interface DailyDeployments {
  day: string;
  total: number;
  succeeded: number;
  failed: number;
}

/** An installation's deployments since a point in time. */
export interface InstallationDeployments {
  installationId: number;
  total: number;
  repositories: number;
  lastDeployedAt: string;
}

export interface InstallationStore {
  upsert(installation: Installation): Promise<void>;
  get(id: number): Promise<Installation | undefined>;
  /** Deletes the installation and its repositories' activity and deployments. */
  delete(id: number): Promise<void>;
  /** Every installation, newest first. */
  /** All installations, most recently active first. */
  list(): Promise<InstallationRecord[]>;
  setRepositoryCount(id: number, count: number): Promise<void>;
  markConfigsSynced(id: number): Promise<void>;
  recordActivity(
    activity: Omit<RepositoryActivity, "lastEventAt">,
  ): Promise<void>;
  /** Repository activity of one installation, most recent first. */
  listActivity(installationId: number): Promise<RepositoryActivity[]>;
  forgetRepositories(ids: number[]): Promise<void>;
  /** Records whether a repository has a deploy config on its default branch. */
  setConfigured(
    repo: ConfiguredRepository,
    installationId: number,
    configured: boolean,
  ): Promise<void>;
  /** An installation's repositories with a deploy config, by name. */
  listConfigured(installationId: number): Promise<ConfiguredRepository[]>;
  /**
   * Saves a deployment. Without a state it keeps the one stored, so a
   * status that arrives before the deployment itself isn't undone. Once a
   * deployment succeeded or failed its state no longer changes.
   */
  recordDeployment(
    deployment: Omit<Deployment, "state"> & { state?: string },
  ): Promise<void>;
  countDeployments(since: string): Promise<DeploymentCounts>;
  /** Deployments per day since `since`, oldest first, leaving out empty days. */
  dailyDeployments(since: string): Promise<DailyDeployments[]>;
  /** The latest deployments, newest first. */
  recentDeployments(limit: number): Promise<Deployment[]>;
  /** Installations by deployments since `since`, most first. */
  topInstallations(
    since: string,
    limit: number,
  ): Promise<InstallationDeployments[]>;
}
