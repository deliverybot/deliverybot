export interface Services {
  lockService: LockService;
  kvService: KVService;
  messageService: MessageService;
  userService: UserService;
}

export type LockService = () => LockStore;
export type KVService = <T>() => KVStore<T>;
export type MessageService = <T>() => MessageBus<T>;
export type UserService = () => UserStore;

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

export interface UserStore {
  update(user: User): Promise<User>;
  delete(id: string): Promise<void>;
}
