import * as factory from "../factory.js";
import { logger, Octokit } from "@deliverybot/core";
import { deploy, IN_FLIGHT_TIMEOUT_MS } from "../../src/deploy.js";
import { InFlightError } from "../../src/types.js";
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

  describe("max_in_flight", () => {
    const github = () => new Octokit({ auth: "test" });
    const args = {
      owner: "Codertocat",
      repo: "Hello-World",
      ref: "refs/heads/changes",
      sha: "0000000000000000000000000000000000000000",
      target: "production",
    };

    test("refuses while a deployment is in progress", async () => {
      const isDeployed = factory.deploy();
      factory.config({ limited: true });
      factory.inFlightDeployment(["in_progress"]);

      await expect(
        deploy(github(), logger, lockStore, args),
      ).rejects.toBeInstanceOf(InFlightError);
      expect(isDeployed.isDone()).toBe(false);
    });

    test("counts a deployment without a status as in progress", async () => {
      const isDeployed = factory.deploy();
      factory.config({ limited: true });
      factory.inFlightDeployment([]);

      await expect(
        deploy(github(), logger, lockStore, args),
      ).rejects.toBeInstanceOf(InFlightError);
      expect(isDeployed.isDone()).toBe(false);
    });

    test("deploys once the previous deployment finished", async () => {
      const isDeployed = factory.deploy();
      factory.config({ limited: true });
      factory.inFlightDeployment(["success"]);

      await deploy(github(), logger, lockStore, args);
      expect(isDeployed.isDone()).toBe(true);
    });

    test("ignores deployments that never finished", async () => {
      const isDeployed = factory.deploy();
      factory.config({ limited: true });
      factory.inFlightDeployment(["pending"], IN_FLIGHT_TIMEOUT_MS + 1000);

      await deploy(github(), logger, lockStore, args);
      expect(isDeployed.isDone()).toBe(true);
    });

    test("force deploys anyway", async () => {
      const isDeployed = factory.deploy();
      factory.config({ limited: true });
      const [listed] = factory.inFlightDeployment(["in_progress"]);

      await deploy(github(), logger, lockStore, { ...args, force: true });
      expect(isDeployed.isDone()).toBe(true);
      expect(listed.isDone()).toBe(false);
    });
  });
});
