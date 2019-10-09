import nock from "nock";
import { Probot } from "probot";
import * as factory from "../../factory";

describe("Deployments PR", () => {
  jest.setTimeout(30000);
  let probot: Probot;

  afterEach(() => {
    nock.cleanAll();
  });

  beforeEach(() => {
    probot = factory.probot();
    factory.token();
    factory.gitCommit();
    factory.deploymentStatus();
    factory.pr();
    factory.config({ valid: true });
    factory.permission({ admin: true });
  });

  test("close deployment on pr close", async () => {
    const deploy = factory.deploy();
    factory.withDeployments([
      { id: 1, environment: "production", transient_environment: true }
    ]);

    await probot.receive(factory.prClosed());
    expect(deploy.isDone()).toBe(true);
  });

  test("no deployment on non-transient pr close", async () => {
    const deploy = factory.deploy();
    factory.withDeployments([
      { id: 1, environment: "production", transient_environment: false }
    ]);

    await probot.receive(factory.prClosed());
    expect(deploy.isDone()).toBe(false);
  });

  test("single deployment on pr close", async () => {
    const deploy = factory.deploy();
    factory.deploymentStatus();
    factory.deploymentStatus();
    factory.withDeployments([
      { id: 1, environment: "production", transient_environment: true },
      { id: 1, environment: "production", transient_environment: true },
      { id: 1, environment: "production", transient_environment: true }
    ]);

    await probot.receive(factory.prClosed());
    expect(deploy.isDone()).toBe(true);
  });
});
