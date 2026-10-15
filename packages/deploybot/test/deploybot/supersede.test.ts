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

  test("looks past a failed deployment set aside as inactive", async () => {
    factory.withDeployments([
      { id: 5, environment: "staging" },
      { id: 4, environment: "staging" },
      { id: 3, environment: "staging" },
    ]);
    factory.latestDeploymentStatus(4, "inactive", "failure");
    factory.latestDeploymentStatus(3, "success");
    const failed = factory.deploymentStatus(4);
    const replaced = factory.deploymentStatus(3);

    await probot.receive(factory.deploymentStatusEvent("success"));
    expect(replaced.isDone()).toBe(true);
    expect(failed.isDone()).toBe(false);
  });

  test("ignores statuses other than success, failure and error", async () => {
    const list = factory.withDeployments([{ id: 4, environment: "staging" }]);

    await probot.receive(factory.deploymentStatusEvent("in_progress"));
    await probot.receive(factory.deploymentStatusEvent("inactive"));
    expect(list.isDone()).toBe(false);
  });
});

describe("supersede after a failed deployment", () => {
  afterEach(() => {
    factory.cleanAll();
  });

  beforeEach(() => {
    factory.token();
  });

  test.each(["failure", "error"])(
    "marks the deployment inactive on %s while an older one runs",
    async (state) => {
      factory.withDeployments([
        { id: 5, environment: "staging" },
        { id: 4, environment: "staging" },
        { id: 3, environment: "staging" },
      ]);
      factory.latestDeploymentStatus(4, "failure");
      factory.latestDeploymentStatus(3, "success");
      const status = factory.deploymentStatus(5, (body: any) => {
        expect(body).toMatchObject({ state: "inactive" });
        return true;
      });
      const running = factory.deploymentStatus(3);

      await probot.receive(factory.deploymentStatusEvent(state));
      expect(status.isDone()).toBe(true);
      expect(running.isDone()).toBe(false);
    },
  );

  test("looks past an earlier failure set aside as inactive", async () => {
    factory.withDeployments([
      { id: 5, environment: "staging" },
      { id: 4, environment: "staging" },
      { id: 3, environment: "staging" },
    ]);
    factory.latestDeploymentStatus(4, "inactive", "failure");
    factory.latestDeploymentStatus(3, "success");
    const status = factory.deploymentStatus(5);

    await probot.receive(factory.deploymentStatusEvent("failure"));
    expect(status.isDone()).toBe(true);
  });

  test("keeps the failure when nothing else runs", async () => {
    factory.withDeployments([
      { id: 5, environment: "staging" },
      { id: 4, environment: "staging" },
      { id: 3, environment: "staging" },
    ]);
    factory.latestDeploymentStatus(4, "inactive", "success");
    const older = factory.latestDeploymentStatus(3, "success");
    const status = factory.deploymentStatus(5);

    await probot.receive(factory.deploymentStatusEvent("failure"));
    expect(status.isDone()).toBe(false);
    expect(older.isDone()).toBe(false);
  });

  test("leaves it to a newer deployment", async () => {
    factory.withDeployments([
      { id: 6, environment: "staging" },
      { id: 5, environment: "staging" },
      { id: 4, environment: "staging" },
    ]);
    const older = factory.latestDeploymentStatus(4, "success");
    const status = factory.deploymentStatus(5);

    await probot.receive(factory.deploymentStatusEvent("failure"));
    expect(status.isDone()).toBe(false);
    expect(older.isDone()).toBe(false);
  });
});
