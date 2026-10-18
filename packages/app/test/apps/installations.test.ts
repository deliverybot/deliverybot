import nock from "nock";
import { app, services } from "../app.js";
import {
  backfillConfigs,
  syncInstallations,
} from "../../src/apps/installations.js";

const installation = {
  id: 42,
  account: { login: "octo-org", type: "Organization" },
  repository_selection: "selected",
};

function receive(name: string, payload: any) {
  return app.probot.receive({ id: "1", name, payload } as any);
}

describe("Installations", () => {
  const store = services.installationService();
  const kv = services.kvService<any>();

  beforeEach(async () => {
    await kv.put("repos/1/locks/prod", { env: "prod" });
    await kv.put("queue/1-abc/jobs/w1", { json: "{}" });
    await kv.put("repos/11/locks/prod", { env: "prod" });
    await kv.put("queue/11-abc/jobs/w1", { json: "{}" });
  });

  const count = (n: number) =>
    nock("https://api.github.com")
      .get("/installation/repositories")
      .query({ per_page: 1 })
      .reply(200, { total_count: n, repositories: [] });

  afterEach(() => nock.cleanAll());

  // The repositories GitHub lists for the installation, all at once.
  const list = (repos: any[]) =>
    nock("https://api.github.com")
      .get("/installation/repositories")
      .query({ per_page: 100 })
      .reply(200, { total_count: repos.length, repositories: repos });

  it("saves new installations with their configured repositories", async () => {
    list([
      { id: 3, node_id: "R_a", full_name: "octo-org/a" },
      { id: 4, node_id: "R_b", full_name: "octo-org/b" },
    ]);
    config("a", 200);
    config("b", 404);
    await receive("installation", { action: "created", installation });
    const saved = (await store.list()).find((i) => i.id === 42);
    expect(saved).toMatchObject({ repositoryCount: 2 });
    expect(saved!.configsSyncedAt).toBeTruthy();
    expect(await store.listConfigured(42)).toEqual([
      { id: 3, nodeId: "R_a", fullName: "octo-org/a" },
    ]);
    expect(await store.get(42)).toEqual({
      id: 42,
      account: "octo-org",
      accountType: "Organization",
      repositorySelection: "selected",
      suspended: false,
    });
    await store.forgetRepositories([3]);
  });

  it("recounts repositories when they're added or removed", async () => {
    list([]);
    await receive("installation", { action: "created", installation });
    count(2);
    await receive("installation_repositories", {
      action: "added",
      installation,
      repositories_added: [{ id: 3 }],
    });
    expect((await store.list()).find((i) => i.id === 42)).toMatchObject({
      repositoryCount: 2,
    });
  });

  it("marks suspended installations", async () => {
    await receive("installation", { action: "suspend", installation });
    expect((await store.get(42))!.suspended).toBe(true);
    count(1);
    await receive("installation", { action: "unsuspend", installation });
    expect((await store.get(42))!.suspended).toBe(false);
  });

  it("deletes data of removed repositories only", async () => {
    await receive("installation_repositories", {
      action: "removed",
      installation,
      repositories_removed: [{ id: 1 }],
    });
    expect(await kv.get("repos/1/locks/prod")).toBeUndefined();
    expect(await kv.get("queue/1-abc/jobs/w1")).toBeUndefined();
    expect(await kv.get("repos/11/locks/prod")).toBeDefined();
    expect(await kv.get("queue/11-abc/jobs/w1")).toBeDefined();
  });

  it("records the latest event of each repository", async () => {
    const repository = { id: 1, full_name: "octo-org/repo" };
    await receive("public", { installation, repository });
    await receive("star", {
      action: "created",
      installation,
      repository,
    });
    const activity = await store.listActivity(42);
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({
      id: 1,
      installationId: 42,
      fullName: "octo-org/repo",
      lastEvent: "star.created",
    });

    await receive("installation_repositories", {
      action: "removed",
      installation,
      repositories_removed: [{ id: 1 }],
    });
    expect(await store.listActivity(42)).toEqual([]);
  });

  it("forgets deleted installations and their repositories", async () => {
    list([]);
    await receive("installation", { action: "created", installation });
    await receive("installation", {
      action: "deleted",
      installation,
      repositories: [{ id: 1 }, { id: 11 }],
    });
    expect(await store.get(42)).toBeUndefined();
    expect(await kv.get("repos/1/locks/prod")).toBeUndefined();
    expect(await kv.get("repos/11/locks/prod")).toBeUndefined();
  });

  // Persists, since auto deploy also reads the config on a push.
  const config = (repo: string, status: number) =>
    nock("https://api.github.com")
      .persist()
      .get(`/repos/octo-org/${repo}/contents/.github%2Fdeploy.yml`)
      .reply(status, status === 200 ? { type: "file" } : {});

  const push = (ref: string, files: Partial<Record<string, string[]>>) =>
    receive("push", {
      ref,
      installation,
      repository: {
        id: 5,
        node_id: "R_app",
        full_name: "octo-org/app",
        name: "app",
        owner: { login: "octo-org" },
        default_branch: "main",
      },
      commits: [{ added: [], modified: [], removed: [], ...files }],
    });

  it("records which added repositories have a deploy config", async () => {
    count(2);
    config("a", 200);
    config("b", 404);
    await receive("installation_repositories", {
      action: "added",
      installation,
      repositories_added: [
        { id: 3, node_id: "R_a", full_name: "octo-org/a" },
        { id: 4, node_id: "R_b", full_name: "octo-org/b" },
      ],
    });
    expect(await store.listConfigured(42)).toEqual([
      { id: 3, nodeId: "R_a", fullName: "octo-org/a" },
    ]);
    await store.forgetRepositories([3]);
  });

  it("rechecks the deploy config when a push to the default branch touches it", async () => {
    config("app", 200);
    await push("refs/heads/main", { added: [".github/deploy.yml"] });
    expect((await store.listConfigured(42)).map((r) => r.id)).toEqual([5]);

    // The config is gone, but pushes to other branches, or that leave the
    // config alone, don't check.
    nock.cleanAll();
    config("app", 404);
    await push("refs/heads/feature", { removed: [".github/deploy.yml"] });
    await push("refs/heads/main", { modified: ["README.md"] });
    expect((await store.listConfigured(42)).map((r) => r.id)).toEqual([5]);

    await push("refs/heads/main", { removed: [".github/deploy.yml"] });
    expect(await store.listConfigured(42)).toEqual([]);
  });

  it("records which repositories have a deploy config when syncing", async () => {
    nock("https://api.github.com")
      .get("/app/installations")
      .query(true)
      .reply(200, [
        {
          id: 42,
          account: { login: "octo-org", type: "Organization" },
          repository_selection: "selected",
          suspended_at: null,
        },
      ])
      .post("/app/installations/42/access_tokens")
      .reply(200, { token: "test" })
      .get("/installation/repositories")
      .query({ per_page: 100 })
      .reply(200, {
        total_count: 2,
        repositories: [
          { id: 6, node_id: "R_c", full_name: "octo-org/c" },
          { id: 7, node_id: "R_d", full_name: "octo-org/d" },
        ],
      });
    config("c", 404);
    config("d", 200);
    expect(await syncInstallations(app.probot, store)).toBe(1);
    expect((await store.listConfigured(42)).map((r) => r.id)).toEqual([7]);
    expect((await store.list()).find((i) => i.id === 42)).toMatchObject({
      repositoryCount: 2,
    });
    await store.forgetRepositories([7]);
  });

  it("backfills configured repositories of unchecked installations once", async () => {
    await store.upsert({
      id: 43,
      account: "other-org",
      accountType: "Organization",
      repositorySelection: "all",
      suspended: false,
    });
    nock("https://api.github.com")
      .get("/installation/repositories")
      .query({ per_page: 100 })
      .reply(200, {
        total_count: 1,
        repositories: [{ id: 8, node_id: "R_e", full_name: "other-org/e" }],
      })
      .get("/repos/other-org/e/contents/.github%2Fdeploy.yml")
      .reply(200, { type: "file" });
    expect(await backfillConfigs(app.probot, store)).toBe(1);
    expect((await store.listConfigured(43)).map((r) => r.id)).toEqual([8]);

    // Checked installations aren't checked again.
    expect(await backfillConfigs(app.probot, store)).toBe(0);
    await store.delete(43);
  });

  it("copies installations GitHub lists", async () => {
    nock("https://api.github.com")
      .get("/app/installations")
      .query(true)
      .reply(200, [
        {
          id: 88,
          account: { login: "old-org", type: "Organization" },
          repository_selection: "all",
          suspended_at: "2020-01-01T00:00:00Z",
        },
        { id: 89, account: { slug: "enterprise" } },
      ]);
    // Suspended installations aren't counted.
    expect(await syncInstallations(app.probot, store)).toBe(1);
    expect(await store.get(88)).toEqual({
      id: 88,
      account: "old-org",
      accountType: "Organization",
      repositorySelection: "all",
      suspended: true,
    });
    await store.delete(88);
  });
});
