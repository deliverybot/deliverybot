import nock from "nock";
import { app, services } from "../app.js";
import { syncInstallations } from "../../src/apps/installations.js";

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

  it("saves new installations", async () => {
    await receive("installation", { action: "created", installation });
    expect(await store.get(42)).toEqual({
      id: 42,
      account: "octo-org",
      accountType: "Organization",
      repositorySelection: "selected",
      suspended: false,
    });
  });

  it("marks suspended installations", async () => {
    await receive("installation", { action: "suspend", installation });
    expect((await store.get(42))!.suspended).toBe(true);
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
