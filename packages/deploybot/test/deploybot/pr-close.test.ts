import * as factory from "../factory";
import { app } from "../app";

const probot = app.probot;

describe("pr-close", () => {
  jest.setTimeout(30000);

  afterEach(() => {
    factory.cleanAll();
  });

  beforeEach(() => {
    factory.token();
    factory.gitCommit();
    factory.repo();
    factory.pr();
    factory.config({ valid: true });
    factory.permission({ admin: true });
  });

  test("close status on pr close", async () => {
    const status = factory.deploymentStatus();
    factory.withDeployments([
      { id: 1, environment: "production", transient_environment: true },
    ]);

    await probot.receive(factory.prClosed());
    expect(status.isDone()).toBe(true);
  });

  test("no status on non-transient pr close", async () => {
    const status = factory.deploymentStatus();
    factory.withDeployments([
      { id: 1, environment: "production", transient_environment: false },
    ]);

    await probot.receive(factory.prClosed());
    expect(status.isDone()).toBe(false);
  });

  test("close multiple statuses", async () => {
    const statuses = [
      factory.deploymentStatus(),
      factory.deploymentStatus(),
      factory.deploymentStatus(),
    ];
    factory.withDeployments([
      { id: 1, environment: "production", transient_environment: true },
      { id: 1, environment: "production", transient_environment: true },
      { id: 1, environment: "production", transient_environment: true },
    ]);

    await probot.receive(factory.prClosed());
    statuses.forEach(status => expect(status.isDone()).toBe(true));
  });
});
