import * as factory from "./factory";

describe("Deployments PR", () => {
  let probot: factory.Probot;
  jest.setTimeout(30000);

  afterEach(() => {
    factory.cleanAll();
  });

  beforeEach(() => {
    probot = factory.probot();
    factory.token();
    factory.gitCommit();
    factory.deploymentStatus();
    factory.pr();
  });

  test("creates a deployment", async () => {
    factory.config({ valid: true });
    factory.permission({ admin: true });
    const deploy = factory.deploy();

    await probot.receive(factory.prDeployComment("review"));
    expect(deploy.isDone()).toBe(true);
  });

  test("creates a deployment production", async () => {
    factory.config({ valid: true });
    factory.permission({ admin: true });
    const deploy = factory.deploy();

    await probot.receive(factory.prDeployComment("production"));
    expect(deploy.isDone()).toBe(true);
  });

  test("error if invalid target", async () => {
    factory.config({ valid: true });
    factory.permission({ admin: true });
    const deploy = factory.deploy();

    const expected =
      ':rotating_light: Failed to trigger deployment. :rotating_light:\nDeployment target "invalid" does not exist';
    const error = factory.errorComment(expected);
    await probot.receive(factory.prDeployComment("invalid"));
    expect(deploy.isDone()).toBe(false);
    expect(error.isDone()).toBe(true);
  });

  test("error comment on invalid file", async () => {
    factory.config({ valid: false });
    factory.permission({ admin: true });
    const deploy = factory.deploy();

    const expected =
      ":rotating_light: Failed to trigger deployment. :rotating_light:\nconfig.fake is not of a type(s) object";
    const error = factory.errorComment(expected);
    await probot.receive(factory.prDeployComment("review"));
    expect(deploy.isDone()).toBe(false);
    expect(error.isDone()).toBe(true);
  });

  test("error comment on api error", async () => {
    factory.config({ valid: true });
    factory.permission({ admin: true });
    const deploy = factory.errorDeploy();

    const expected =
      ":rotating_light: Failed to trigger deployment. :rotating_light:\nAPI error";
    const error = factory.errorComment(expected);
    await probot.receive(factory.prDeployComment("review"));
    expect(deploy.isDone()).toBe(true);
    expect(error.isDone()).toBe(true);
  });

  test("no deployment with read access", async () => {
    factory.config({ valid: true });
    factory.permission({ admin: false });
    const deploy = factory.deploy();

    await probot.receive(factory.prDeployComment("review"));
    expect(deploy.isDone()).toBe(false);
  });
});
