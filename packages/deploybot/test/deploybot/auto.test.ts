import * as factory from "../factory.js";
import { app, services } from "../app.js";
import { match } from "../../src/auto.js";
import { EnvLockStore } from "../../src/store.js";

const probot = app.probot;
const lockStore = new EnvLockStore(services.kvService);

describe("auto", () => {
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
      ["refs/heads/*", "refs/heads/feature/nested"],
      ["refs/tags/v*-rc*", "refs/tags/v1.2.3-rc1"],
      ["refs/tags/v?", "refs/tags/v2"],
      ["refs/tags/v[0-9]*", "refs/tags/v10"],
      ["refs/tags/v[^a-z]", "refs/tags/v2"],
      ["refs/tags/v1.0", "refs/tags/v1.0"],
      [["refs/heads/master", "refs/tags/*"], "refs/tags/v1"],
      [["refs/tags/v*", "!refs/tags/v*a*"], "refs/tags/v2"],
      [["pr"], "pr"],
    ];
    const unmatched = [
      ["refs/heads/staging", "refs/heads/master"],
      ["refs/tags/v", "refs/tags/v1.2.3"],
      ["refs/heads/*", "refs/tags/simple-tag"],
      ["refs/tags/v*-rc*", "refs/tags/v1.2.3"],
      ["refs/tags/v?", "refs/tags/v10"],
      ["refs/tags/v[0-9]*", "refs/tags/vx"],
      ["refs/tags/v[^a-z]", "refs/tags/va"],
      ["refs/tags/v1.0", "refs/tags/v1x0"],
      ["refs/tags/v[1", "refs/tags/v1"],
      [["refs/tags/v*", "!refs/tags/v*a*"], "refs/tags/v2a2"],
      [["!refs/tags/beta"], "refs/tags/v1"],
      [[], "refs/heads/master"],
    ];

    matches.forEach((m) => {
      it(`matches ${m[0]} with ${m[1]}`, () =>
        expect(match(m[0], m[1] as string)).toBe(true));
    });
    unmatched.forEach((m) => {
      it(`does not match ${m[0]} with ${m[1]}`, () =>
        expect(match(m[0], m[1] as string)).toBe(false));
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

  test("ignores check runs that start and pending statuses", async () => {
    factory.config({ valid: true });
    factory.noDeployments();

    let deploy = factory.deployConflict();
    await probot.receive(factory.push());
    expect(deploy.isDone()).toBe(true);

    factory.noDeployments();
    deploy = factory.deploy();
    await probot.receive(factory.checkRun("created"));
    await probot.receive(factory.status("pending"));
    expect(deploy.isDone()).toBe(false);

    await probot.receive(factory.checkRun("completed"));
    expect(deploy.isDone()).toBe(true);
  });

  test("drops finished checks on commits without a watch", async () => {
    const seen: string[] = [];
    probot.onAny(async (context) => {
      seen.push(context.name);
    });
    await probot.receive(factory.checkRun("completed"));
    await probot.receive(factory.status("success"));
    expect(seen).toEqual([]);
  });

  test("drops pull request actions that don't deploy", async () => {
    const seen: string[] = [];
    probot.onAny(async (context) => {
      if (context.name === "pull_request") seen.push(context.payload.action);
    });
    for (const action of ["labeled", "edited", "review_requested"]) {
      await probot.receive({
        ...factory.prOpened(),
        payload: { ...factory.prOpened().payload, action },
      });
    }
    expect(seen).toEqual([]);
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
