import { Logger } from "@deliverybot/core";
import {
  deploy as deployCommit,
  EnvLockStore,
  RawInputs,
} from "@deliverybot/deploybot";
import { User, Repo } from "../auth.js";
import { config } from "./queries.js";

class ValidationError extends Error {
  public status = "ValidationError";
}

export async function Promote({
  user,
  repo,
  sha,
}: {
  user: User;
  repo: Repo;
  sha: string;
}) {
  await user.github.rest.repos.createCommitStatus({
    owner: repo.owner,
    repo: repo.repo,
    sha,
    state: "success",
    context: "deliverybot/promotion",
  });
}

export async function Deploy({
  user,
  log,
  repo,
  sha,
  target,
  force,
  task,
  lock,
  inputs,
}: {
  user: User;
  log: Logger;
  repo: Repo;
  sha: string;
  target: string;
  force?: boolean;
  task?: string;
  lock: EnvLockStore;
  inputs?: RawInputs;
}) {
  await deployCommit(user.github, log, lock, {
    owner: repo.owner,
    repo: repo.repo,
    target,
    sha,
    // Don't want to specify the branch here otherwise we'll deploy the head
    // instead of the current commit.
    ref: sha,
    force,
    task,
    inputs,
  });
}

/**
 * Reads deploy inputs from a request body. The dashboard form posts them as
 * flat `inputs[name]` fields; API clients may send an `inputs` object.
 */
export function bodyInputs(body: { [k: string]: unknown }): RawInputs {
  const inputs: RawInputs = {};
  const nested = body.inputs;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    Object.assign(inputs, nested);
  }
  for (const [key, value] of Object.entries(body)) {
    const match = key.match(/^inputs\[([^\]]+)\]$/);
    if (match) inputs[match[1]] = value;
  }
  return inputs;
}

export async function SetLock({
  lock,
  target,
  repo,
  user,
  state,
}: {
  user: User;
  lock: EnvLockStore;
  target: string;
  repo: Repo;
  state: "locked" | "unlocked";
}) {
  const { error, config: targets } = await config(
    user.github,
    repo.owner,
    repo.repo,
    repo.defaultBranch,
  );
  if (error) {
    throw error;
  }
  if (!targets) {
    throw new ValidationError(`Target does not exist "${target}"`);
  }
  const targetVal = targets[target];
  if (!targetVal) {
    throw new ValidationError(`Target does not exist "${target}"`);
  }
  if (!targetVal.environment) {
    throw new ValidationError(`Target does not specify an environment`);
  }
  if (targetVal.environment.includes("${{")) {
    throw new ValidationError(
      `Target environment is dynamic "${targetVal.environment}"`,
    );
  }
  switch (state) {
    case "locked":
      return await lock.lock(repo.id, targetVal.environment);
    case "unlocked":
      return await lock.unlock(repo.id, targetVal.environment);
  }
}
