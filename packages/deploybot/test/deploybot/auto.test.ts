import * as factory from "../factory";
import { app, services } from "../app";
import { match } from "../../src/auto";
import { EnvLockStore } from "../../src/store";

const probot = app.probot;
const lockStore = new EnvLockStore(services.kvService);

describe("auto", () => {
  jest.setTimeout(30000);

  afterEach(() => {
    factory.cleanAll();
  });

  beforeEach(() => {
    factory.token();
    factory.deploymentStatus();
    factory.pr();
    factory.permission({ admin: true });
    factory.repo().persist();
    factory.gitCommit().persist();
    factory.gitRef().persist();
  });

  describe("Match", () => {
    const matches = [
      ["refs/heads/master", "refs/heads/master"],
      ["refs/heads/*", "refs/heads/master"],
      ["refs/*", "refs/tags/simple-tag"],
      ["refs/tags/*", "refs/tags/simple-tag"],
      ["refs/tags/v*", "refs/tags/v1.2.3"],
    ];
    const unmatched = [
      ["refs/heads/staging", "refs/heads/master"],
      ["refs/tags/v", "refs/tags/v1.2.3"],
      ["refs/heads/*", "refs/tags/simple-tag"],
    ];

    matches.forEach(m => {
      it(`matches ${m[0]}`, () => expect(match(m[0], m[1])).toBe(true));
    });
    unmatched.forEach(m => {
      it(`unmatched ${m[0]}`, () => expect(match(m[0], m[1])).toBe(false));
    });
  });

  test("creates a deployment on push", async () => {
    const deploy = factory.deploy();
    factory.config({ valid: true });
    factory.noDeployments();

    await probot.receive(factory.push());
    expect(deploy.isDone()).toBe(true);
  });

  test("creates a deployment on pull request opened", async () => {
    const deploy = factory.deploy();
    factory.config({ valid: true });
    factory.noDeployments();

    await probot.receive(factory.prOpened());
    expect(deploy.isDone()).toBe(true);
  });

  test("creates a deployment on pull request push", async () => {
    const deploy = factory.deploy();
    factory.config({ valid: true });
    factory.noDeployments();

    await probot.receive(factory.prSync());
    expect(deploy.isDone()).toBe(true);
  });

  test("no deployment if locked", async () => {
    const deploy = factory.deploy();
    factory.config({ valid: true });
    factory.noDeployments();

    await lockStore.lock(1, "production");
    await probot.receive(factory.push());
    await lockStore.unlock(1, "production");
    expect(deploy.isDone()).toBe(false);
  });

  test("creates a deployment if other env locked", async () => {
    const deploy = factory.deploy();
    factory.config({ valid: true });
    factory.noDeployments();

    await lockStore.lock(1, "staging");
    await probot.receive(factory.push());
    await lockStore.unlock(1, "staging");
    expect(deploy.isDone()).toBe(true);
  });

  test("no error if no config", async () => {
    const deploy = factory.deploy();
    factory.noConfig();
    factory.noDeployments();

    await probot.receive(factory.push());
    expect(deploy.isDone()).toBe(false);
  });

  test("no error if config error", async () => {
    const deploy = factory.deploy();
    factory.config({ valid: false });
    factory.noDeployments();

    await probot.receive(factory.push());
    expect(deploy.isDone()).toBe(false);
  });

  test("creates a deployment on status", async () => {
    factory.config({ valid: true });
    factory.noDeployments();

    let deploy = factory.deployConflict();
    await probot.receive(factory.push());
    expect(deploy.isDone()).toBe(true);

    factory.noDeployments();
    deploy = factory.deploy();
    await probot.receive(factory.status());
    expect(deploy.isDone()).toBe(true);
  });

  test("creates a deployment on check run", async () => {
    factory.config({ valid: true });
    factory.noDeployments();

    let deploy = factory.deployConflict();
    await probot.receive(factory.push());
    expect(deploy.isDone()).toBe(true);

    factory.noDeployments();
    deploy = factory.deploy();
    await probot.receive(factory.checkRun());
    expect(deploy.isDone()).toBe(true);
  });

  test("discards if not the latest", async () => {
    factory.config({ valid: true });
    factory.noDeployments();

    // Since push0 returns an earlier commit that doesn't match the current ref
    // this will immediately be discarded and not processed.
    const noDeploy = factory.deployConflict();
    await probot.receive(factory.push0());
    expect(noDeploy.isDone()).toBe(false);
  });

  test("creates a deployment if other environment exists", async () => {
    const deploy = factory.deploy();
    factory.config({ valid: true });
    factory.deploymentsExist("staging"); // Is auto deploying production.

    await probot.receive(factory.push());
    expect(deploy.isDone()).toBe(true);
  });

  test("no deployment if environment exists", async () => {
    const deploy = factory.deploy();
    factory.config({ valid: true });
    factory.deploymentsExist("production"); // Is auto deploying production.

    await probot.receive(factory.push());
    expect(deploy.isDone()).toBe(false);
  });
});
