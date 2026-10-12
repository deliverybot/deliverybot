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

export interface UserStore {
  update(user: User): Promise<User>;
  delete(id: string): Promise<void>;
  /** Every user, most recently signed in first. */
  list(): Promise<UserRecord[]>;
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

export interface InstallationStore {
  upsert(installation: Installation): Promise<void>;
  get(id: number): Promise<Installation | undefined>;
  /** Deletes the installation and the activity of its repositories. */
  delete(id: number): Promise<void>;
  /** Every installation, newest first. */
  list(): Promise<InstallationRecord[]>;
  recordActivity(
    activity: Omit<RepositoryActivity, "lastEventAt">,
  ): Promise<void>;
  /** Repository activity of one installation, most recent first. */
  listActivity(installationId: number): Promise<RepositoryActivity[]>;
  forgetRepositories(ids: number[]): Promise<void>;
}
