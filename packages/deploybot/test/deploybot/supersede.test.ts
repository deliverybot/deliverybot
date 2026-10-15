import * as factory from "../factory.js";
import { app } from "../app.js";

const probot = app.probot;

describe("supersede", () => {
  afterEach(() => {
    factory.cleanAll();
  });

  beforeEach(() => {
    factory.token();
  });

  test("marks an older successful deployment inactive", async () => {
    factory.withDeployments([
      { id: 5, environment: "staging" },
      { id: 4, environment: "staging" },
    ]);
    factory.latestDeploymentStatus(5, "success");
    factory.latestDeploymentStatus(4, "success");
    const status = factory.deploymentStatus(4, (body: any) => {
      expect(body).toMatchObject({ state: "inactive" });
      return true;
    });

    await probot.receive(factory.deploymentStatusEvent("success"));
    expect(status.isDone()).toBe(true);
  });

  test("leaves failed deployments and stops at an inactive one", async () => {
    factory.withDeployments([
      { id: 5, environment: "staging" },
      { id: 4, environment: "staging" },
      { id: 3, environment: "staging" },
      { id: 2, environment: "staging" },
      { id: 1, environment: "staging" },
    ]);
    factory.latestDeploymentStatus(4, "failure");
    factory.latestDeploymentStatus(3, "success");
    factory.latestDeploymentStatus(2, "inactive");
    const failed = factory.deploymentStatus(4);
    const replaced = factory.deploymentStatus(3);
    const older = factory.latestDeploymentStatus(1, "success");

    await probot.receive(factory.deploymentStatusEvent("success"));
    expect(replaced.isDone()).toBe(true);
    expect(failed.isDone()).toBe(false);
    expect(older.isDone()).toBe(false);
  });

  test("also marks a newer successful deployment inactive", async () => {
    // The deployment that finished last is the one running.
    factory.withDeployments([
      { id: 6, environment: "staging" },
      { id: 5, environment: "staging" },
    ]);
    factory.latestDeploymentStatus(6, "success");
    const status = factory.deploymentStatus(6);

    await probot.receive(factory.deploymentStatusEvent("success"));
    expect(status.isDone()).toBe(true);
  });

  test("ignores statuses other than success", async () => {
    const list = factory.withDeployments([{ id: 4, environment: "staging" }]);

    await probot.receive(factory.deploymentStatusEvent("in_progress"));
    await probot.receive(factory.deploymentStatusEvent("inactive"));
    expect(list.isDone()).toBe(false);
  });
});
