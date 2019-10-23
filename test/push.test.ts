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
    factory.deploymentStatus();
    factory.pr();
    factory.config({ valid: true });
    factory.permission({ admin: true });
    factory.gitRef();
    deploy = factory.deploy();
  });

  test("creates a deployment on push", async () => {
    factory.noDeployments();

    await probot.receive(factory.push());
    expect(deploy.isDone()).toBe(true);
  });

  test("creates a deployment on status", async () => {
    factory.noDeployments();

    await probot.receive(factory.status());
    expect(deploy.isDone()).toBe(true);
  });

  test("creates a deployment on status", async () => {
    factory.noDeployments();

    await probot.receive(factory.status());
    expect(deploy.isDone()).toBe(true);
  });

  test("creates a deployment on check run", async () => {
    factory.noDeployments();

    await probot.receive(factory.checkRun());
    expect(deploy.isDone()).toBe(true);
  });

  test("creates a deployment if other environment exists", async () => {
    factory.deploymentsExist("staging"); // Is auto deploying production.

    await probot.receive(factory.push());
    expect(deploy.isDone()).toBe(true);
  });

  test("no deployment if environment exists", async () => {
    factory.deploymentsExist("production"); // Is auto deploying production.

    await probot.receive(factory.push());
    expect(deploy.isDone()).toBe(false);
  });
});
