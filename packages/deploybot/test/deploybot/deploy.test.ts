import nock from "nock";
import * as factory from "../factory.js";
import { logger, Octokit } from "@deliverybot/core";
import { deploy } from "../../src/deploy.js";
import { EnvLockStore } from "../../src/store.js";
import { AccessError } from "../../src/types.js";
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
      actor: "Codertocat",
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
      actor: "Codertocat",
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
      actor: "Codertocat",
      task: "foobar",
      force: true,
    });
    expect(isDeployed.isDone()).toBe(true);
  });
});

describe("deploy access", () => {
  const github = () => new Octokit({ auth: "test" });
  const args = (actor: string | null, target = "production") => ({
    owner: "Codertocat",
    repo: "Hello-World",
    ref: "refs/heads/featureA",
    sha: "0000000000000000000000000000000000000000",
    target,
    actor,
  });
  const yml = (production: string, extra = "") => `
production:
  environment: production
${production}
staging:
  environment: staging
${extra}`;

  // Serves a different deploy.yml for the deployed ref and the default
  // branch (a request without a ref).
  const configs = (ref: string, defaultBranch: string) =>
    nock("https://api.github.com")
      .persist()
      .get(
        /^\/repos\/Codertocat\/Hello-World\/contents\/\.github(\/|%2F)deploy\.yml/,
      )
      .query(() => true)
      .reply((uri) => [
        200,
        {
          content: Buffer.from(
            uri.includes("ref=") ? ref : defaultBranch,
          ).toString("base64"),
        },
      ]);

  const membership = (team: string, user: string, status: number) =>
    nock("https://api.github.com")
      .get(`/orgs/Codertocat/teams/${team}/memberships/${user}`)
      .reply(status, status === 200 ? { state: "active" } : {});

  afterEach(() => {
    factory.cleanAll();
  });

  beforeEach(() => {
    factory.repo().persist();
    factory.gitCommit().persist();
  });

  test("deploys when the user is listed", async () => {
    const conf = yml("  deployers: [codertocat]");
    configs(conf, conf);
    const isDeployed = factory.deploy();
    await deploy(github(), logger, lockStore, args("Codertocat"));
    expect(isDeployed.isDone()).toBe(true);
  });

  test("refuses a user who isn't listed", async () => {
    const conf = yml("  deployers: [someone-else]");
    configs(conf, conf);
    const isDeployed = factory.deploy();
    await expect(
      deploy(github(), logger, lockStore, args("Codertocat")),
    ).rejects.toBeInstanceOf(AccessError);
    expect(isDeployed.isDone()).toBe(false);
  });

  test("deploys when the user is in a listed team", async () => {
    const conf = yml("  deployers: ['@Codertocat/ops']");
    configs(conf, conf);
    membership("ops", "Codertocat", 200);
    const isDeployed = factory.deploy();
    await deploy(github(), logger, lockStore, args("Codertocat"));
    expect(isDeployed.isDone()).toBe(true);
  });

  test("refuses when team membership can't be read", async () => {
    const conf = yml("  deployers: [Codertocat/ops]");
    configs(conf, conf);
    membership("ops", "Codertocat", 403);
    await expect(
      deploy(github(), logger, lockStore, args("Codertocat")),
    ).rejects.toBeInstanceOf(AccessError);
  });

  test("a branch can't drop the default branch's deployers", async () => {
    configs(yml(""), yml("  deployers: [someone-else]"));
    await expect(
      deploy(github(), logger, lockStore, args("Codertocat")),
    ).rejects.toBeInstanceOf(AccessError);
  });

  test("a new target can't reach a restricted environment", async () => {
    configs(
      yml("", "sneaky:\n  environment: production\n"),
      yml("  deployers: [someone-else]"),
    );
    await expect(
      deploy(github(), logger, lockStore, args("Codertocat", "sneaky")),
    ).rejects.toBeInstanceOf(AccessError);
  });

  test("other targets stay open", async () => {
    const conf = yml("  deployers: [someone-else]");
    configs(conf, conf);
    const isDeployed = factory.deploy();
    await deploy(github(), logger, lockStore, args("Codertocat", "staging"));
    expect(isDeployed.isDone()).toBe(true);
  });

  test("automatic deploys skip the check", async () => {
    const conf = yml("  deployers: [someone-else]");
    configs(conf, conf);
    const isDeployed = factory.deploy();
    await deploy(github(), logger, lockStore, args(null));
    expect(isDeployed.isDone()).toBe(true);
  });
});
