import * as factory from "../factory.js";
import { app, services } from "../app.js";
import { match } from "../../src/auto.js";
import { EnvLockStore, WatchStore } from "../../src/store.js";

const probot = app.probot;
const lockStore = new EnvLockStore(services.kvService);
const watchStore = new WatchStore(services.kvService);

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
    ];
    const unmatched = [
      ["refs/heads/staging", "refs/heads/master"],
      ["refs/tags/v", "refs/tags/v1.2.3"],
      ["refs/heads/*", "refs/tags/simple-tag"],
    ];

    matches.forEach((m) => {
      it(`matches ${m[0]}`, () => expect(match(m[0], m[1])).toBe(true));
    });
    unmatched.forEach((m) => {
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

  describe("with paths", () => {
    // Watches whose deploy is still waiting on checks outlive a test.
    afterEach(async () => {
      const sha = factory.fixtures.push.after;
      for (const watch of await watchStore.listWatchBySha(1, sha)) {
        await watchStore.delWatch(1, watch);
      }
    });

    const monorepo = `
api:
  auto_deploy_on: refs/heads/changes
  environment: api
  path: ./services/api/
web:
  auto_deploy_on: refs/heads/changes
  environment: web
  path: services/web
`;

    test("deploys only the targets whose path a push changes", async () => {
      factory.configYaml(monorepo);
      factory.noDeployments();
      const api = factory.deployTo("api");
      const web = factory.deployTo("web");

      await probot.receive(factory.pushFiles(["services/api/index.ts"]));
      expect(api.isDone()).toBe(true);
      expect(web.isDone()).toBe(false);
    });

    test("doesn't match a sibling with the same prefix", async () => {
      factory.configYaml(monorepo);
      const api = factory.deployTo("api");

      await probot.receive(factory.pushFiles(["services/api-docs/README.md"]));
      expect(api.isDone()).toBe(false);
    });

    test("deploys when a push lists no files", async () => {
      factory.configYaml(monorepo);
      factory.noDeployments();
      factory.noDeployments();
      const api = factory.deployTo("api");
      const web = factory.deployTo("web");

      await probot.receive(factory.push());
      expect(api.isDone()).toBe(true);
      expect(web.isDone()).toBe(true);
    });

    test("deploys a pull request only if it changes the path", async () => {
      factory.configYaml(`
review-api:
  auto_deploy_on: pr
  environment: api-pr
  path: services/api
review-web:
  auto_deploy_on: pr
  environment: web-pr
  path: services/web
`);
      factory.prFiles(["services/web/app.css"]);
      factory.noDeployments();
      const api = factory.deployTo("api-pr");
      const web = factory.deployTo("web-pr");

      await probot.receive(factory.prOpened());
      expect(api.isDone()).toBe(false);
      expect(web.isDone()).toBe(true);
    });

    describe("after newer commits on the ref", () => {
      const newer = "1111111111111111111111111111111111111111";

      beforeEach(async () => {
        factory.configYaml(monorepo);
        factory.noDeployments();
        const pending = factory.deployConflict();
        await probot.receive(factory.pushFiles(["services/api/index.ts"]));
        expect(pending.isDone()).toBe(true);

        // The ref moves on before the checks of the watched commit pass.
        factory.cleanAll();
        factory.token();
        factory.deploymentStatus();
        factory.repo().persist();
        factory.gitCommit().persist();
        factory.configYaml(monorepo);
        factory.gitRefAt(newer);
      });

      afterEach(async () => {
        for (const watch of await watchStore.listWatchBySha(1, newer)) {
          await watchStore.delWatch(1, watch);
        }
      });

      test("deploys the newer commit if they leave the path alone", async () => {
        factory.compare("ahead", ["services/web/index.ts"]);
        factory.noDeployments();
        const api = factory.deployTo("api");

        await probot.receive(factory.status());
        expect(api.isDone()).toBe(true);
        expect(await watchStore.listWatchBySha(1, newer)).toEqual([]);
      });

      test("keeps watching the newer commit until its checks pass", async () => {
        factory.compare("ahead", ["services/web/index.ts"]);
        factory.noDeployments();
        const pending = factory.deployConflict();

        await probot.receive(factory.status());
        expect(pending.isDone()).toBe(true);
        const moved = await watchStore.listWatchBySha(1, newer);
        expect(moved.map((w) => w.target)).toEqual(["api"]);
        const old = factory.fixtures.push.after;
        expect(await watchStore.listWatchBySha(1, old)).toEqual([]);
      });

      test("discards the watch if they change the path", async () => {
        factory.compare("ahead", ["services/api/other.ts"]);
        const api = factory.deployTo("api");

        await probot.receive(factory.status());
        expect(api.isDone()).toBe(false);
      });
    });
  });
});
