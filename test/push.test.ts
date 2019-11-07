import * as factory from "./factory";

describe("Deployments PR", () => {
  jest.setTimeout(30000);
  let deploy: factory.Scope;
  let probot: factory.Probot;

  afterEach(() => {
    factory.cleanAll();
  });

  beforeEach(() => {
    probot = factory.probot();
    factory.token();
    factory.gitCommit();
    factory.repo();
    factory.deploymentStatus();
    factory.pr();
    factory.permission({ admin: true });
    factory.gitRef();
    deploy = factory.deploy();
  });

  test("creates a deployment on push", async () => {
    factory.config({ valid: true });
    factory.noDeployments();

    await probot.receive(factory.push());
    expect(deploy.isDone()).toBe(true);
  });

  test("no deployment if locked", async () => {
    factory.config({ valid: true });
    factory.noDeployments();

    await factory.store.lockEnv(1, "production");
    await probot.receive(factory.push());
    await factory.store.unlockEnv(1, "production");
    expect(deploy.isDone()).toBe(false);
  });

  test("creates a deployment if other env locked", async () => {
    factory.config({ valid: true });
    factory.noDeployments();

    await factory.store.lockEnv(1, "staging");
    await probot.receive(factory.push());
    await factory.store.unlockEnv(1, "staging");
    expect(deploy.isDone()).toBe(true);
  });

  test("no error if no config", async () => {
    factory.noConfig();
    factory.noDeployments();

    await probot.receive(factory.push());
    expect(deploy.isDone()).toBe(false);
  });

  test("no error if config error", async () => {
    factory.config({ valid: false });
    factory.noDeployments();

    await probot.receive(factory.push())
    expect(deploy.isDone()).toBe(false);
  });

  test("creates a deployment on status", async () => {
    factory.config({ valid: true });
    factory.noDeployments();

    await probot.receive(factory.status());
    expect(deploy.isDone()).toBe(true);
  });

  test("creates a deployment on status", async () => {
    factory.config({ valid: true });
    factory.noDeployments();

    await probot.receive(factory.status());
    expect(deploy.isDone()).toBe(true);
  });

  test("creates a deployment on check run", async () => {
    factory.config({ valid: true });
    factory.noDeployments();

    await probot.receive(factory.checkRun());
    expect(deploy.isDone()).toBe(true);
  });

  test("creates a deployment if other environment exists", async () => {
    factory.config({ valid: true });
    factory.deploymentsExist("staging"); // Is auto deploying production.

    await probot.receive(factory.push());
    expect(deploy.isDone()).toBe(true);
  });

  test("no deployment if environment exists", async () => {
    factory.config({ valid: true });
    factory.deploymentsExist("production"); // Is auto deploying production.

    await probot.receive(factory.push());
    expect(deploy.isDone()).toBe(false);
  });
});
