import * as factory from "../factory.js";
import { logger, Octokit } from "@deliverybot/core";
import { ProbotOctokit } from "probot";
import { deploy } from "../../src/deploy.js";
import { EnvLockStore } from "../../src/store.js";
import { services } from "../app.js";

const lockStore = new EnvLockStore(services.kvService);

describe("deploy", () => {
  afterEach(() => {
    factory.cleanAll();
  });

  beforeEach(() => {
    factory.token();
    factory.permission({ admin: true });
    factory.repo().persist();
    factory.gitCommit().persist();
    factory.gitRef().persist();
  });

  test("creates a deployment", async () => {
    const isDeployed = factory.deploy({
      ref: "refs/heads/featureA",
      task: "deploy",
      transient_environment: false,
      production_environment: true,
      environment: "production",
      auto_merge: true,
      required_contexts: ["continuous-integration/travis-ci/push"],
      description: "A test environment based on Docker",
      payload: { target: "production" },
    });
    factory.config({ valid: true });

    const github = new Octokit({ auth: "test" });

    await deploy(github, logger, lockStore, {
      owner: "Codertocat",
      repo: "Hello-World",
      ref: "refs/heads/featureA",
      sha: "0000000000000000000000000000000000000000",
      target: "production",
    });
    expect(isDeployed.isDone()).toBe(true);
  });

  test("creates a deployment with a task", async () => {
    const isDeployed = factory.deploy({
      ref: "refs/heads/featureA",
      task: "foobar",
      transient_environment: false,
      production_environment: true,
      environment: "production",
      auto_merge: true,
      required_contexts: ["continuous-integration/travis-ci/push"],
      description: "A test environment based on Docker",
      payload: { target: "production" },
    });
    factory.config({ valid: true });

    const github = new Octokit({ auth: "test" });

    await deploy(github, logger, lockStore, {
      owner: "Codertocat",
      repo: "Hello-World",
      ref: "refs/heads/featureA",
      sha: "0000000000000000000000000000000000000000",
      target: "production",
      task: "foobar",
    });
    expect(isDeployed.isDone()).toBe(true);
  });

  test("creates a deployment with force", async () => {
    const isDeployed = factory.deploy({
      ref: "refs/heads/featureA",
      task: "foobar",
      transient_environment: false,
      production_environment: true,
      environment: "production",
      auto_merge: true,
      required_contexts: [],
      description: "A test environment based on Docker",
      payload: { target: "production" },
    });
    factory.config({ valid: true });

    const github = new Octokit({ auth: "test" });

    await deploy(github, logger, lockStore, {
      owner: "Codertocat",
      repo: "Hello-World",
      ref: "refs/heads/featureA",
      sha: "0000000000000000000000000000000000000000",
      target: "production",
      task: "foobar",
      force: true,
    });
    expect(isDeployed.isDone()).toBe(true);
  });

  describe("auto_merge", () => {
    // Octokit retries 409 responses by default.
    const github = () =>
      new ProbotOctokit({
        auth: { token: "test" },
        retry: { enabled: false },
      }) as Octokit;
    const args = {
      owner: "Codertocat",
      repo: "Hello-World",
      ref: "featureA",
      sha: "0000000000000000000000000000000000000000",
      target: "production",
    };

    beforeEach(() => {
      factory.config({ valid: true });
    });

    test("reports a merge of the default branch", async () => {
      const merged = factory.mergedDeploy();

      await expect(deploy(github(), logger, lockStore, args)).rejects.toThrow(
        expect.objectContaining({
          status: "AutoMergeError",
          message:
            "Merged master into featureA instead of deploying: deploy the new commit once its checks pass",
        }),
      );
      expect(merged.isDone()).toBe(true);
    });

    test("reports a merge conflict", async () => {
      factory.conflictDeploy("Conflict merging master into featureA.");

      await expect(deploy(github(), logger, lockStore, args)).rejects.toThrow(
        expect.objectContaining({
          status: "AutoMergeError",
          message:
            "Could not merge master into featureA: resolve the conflicts and deploy again",
        }),
      );
    });

    test("passes other conflicts through", async () => {
      factory.conflictDeploy(
        "Conflict: Commit status checks failed for featureA.",
      );

      await expect(deploy(github(), logger, lockStore, args)).rejects.toThrow(
        expect.objectContaining({ status: 409 }),
      );
    });
  });
});
