import * as factory from "../factory.js";
import { logger, Octokit } from "@deliverybot/core";
import nock from "nock";
import { config, deploy } from "../../src/deploy.js";
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

  test("adds inputs to the payload and templates", async () => {
    const isDeployed = factory.deploy({
      ref: "refs/heads/featureA",
      task: "deploy",
      transient_environment: false,
      production_environment: false,
      environment: "production",
      auto_merge: false,
      required_contexts: [],
      description: "Deploy 1.2.3",
      payload: {
        target: "production",
        foo: "bar",
        inputs: { version: "1.2.3", dry_run: true, region: "us" },
      },
    });
    factory.inputsConfig();

    const github = new Octokit({ auth: "test" });

    await deploy(github, logger, lockStore, {
      owner: "Codertocat",
      repo: "Hello-World",
      ref: "refs/heads/featureA",
      sha: "0000000000000000000000000000000000000000",
      target: "production",
      inputs: { version: "1.2.3", dry_run: "true", region: "us" },
    });
    expect(isDeployed.isDone()).toBe(true);
  });

  test("refuses to deploy without a required input", async () => {
    factory.inputsConfig();
    const github = new Octokit({ auth: "test" });

    await expect(
      deploy(github, logger, lockStore, {
        owner: "Codertocat",
        repo: "Hello-World",
        ref: "refs/heads/featureA",
        sha: "0000000000000000000000000000000000000000",
        target: "production",
      }),
    ).rejects.toThrow('Input "version" is required');
  });

  test("rejects an invalid inputs declaration", async () => {
    nock("https://api.github.com")
      .get(/deploy\.yml/)
      .reply(200, {
        content: Buffer.from(
          "production:\n  inputs:\n    region:\n      type: choice\n",
        ).toString("base64"),
      });
    const github = new Octokit({ auth: "test" });

    await expect(
      config(github, { owner: "Codertocat", repo: "Hello-World" }),
    ).rejects.toThrow(/config.production.inputs.region/);
  });
});
