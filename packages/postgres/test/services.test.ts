import { Client } from "pg";
import { LockError, localServices } from "@deliverybot/core";
import { setup, DATABASE_URL } from "./db.js";
import { migrate, postgresServices } from "../src/index.js";
import { CHANNEL } from "../src/message.js";

let db: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  db = await setup();
});

afterAll(async () => {
  await db.pool.end();
});

beforeEach(async () => {
  await db.pool.query(
    "TRUNCATE kv, users, repository_visits, jobs, installations, repositories, deployments",
  );
});

describe("migrate", () => {
  test("is idempotent", async () => {
    await migrate(db.pool);
    await migrate(db.pool);
  });
});

describe("kv", () => {
  test("put, get and delete", async () => {
    const kv = db.services.kvService<{ a: number }>();
    expect(await kv.get("x/1")).toBeUndefined();
    await kv.put("x/1", { a: 1 });
    await kv.put("x/1", { a: 2 });
    expect(await kv.get("x/1")).toEqual({ a: 2 });
    await kv.del("x/1");
    expect(await kv.get("x/1")).toBeUndefined();
  });

  test("list returns direct children only", async () => {
    const kv = db.services.kvService<{ env: string }>();
    await kv.put("repos/1/locks/prod", { env: "prod" });
    await kv.put("repos/1/locks/staging", { env: "staging" });
    await kv.put("repos/1/locks/prod/history/1", { env: "nested" });
    await kv.put("repos/10/locks/prod", { env: "other repo" });
    await kv.put("repos/1/locksmith", { env: "sibling" });
    expect(await kv.list("repos/1/locks")).toEqual([
      { env: "prod" },
      { env: "staging" },
    ]);
  });

  test("delPrefix deletes keys with the prefix only", async () => {
    const kv = db.services.kvService<number>();
    await kv.put("queue/1-a/jobs/1", 1);
    await kv.put("queue/1-b/jobs/2", 2);
    await kv.put("queue/10-a/jobs/3", 3);
    await kv.put("queue/1_x", 4);
    await kv.delPrefix("queue/1-");
    expect(await kv.get("queue/1-a/jobs/1")).toBeUndefined();
    expect(await kv.get("queue/1-b/jobs/2")).toBeUndefined();
    expect(await kv.get("queue/10-a/jobs/3")).toEqual(3);
    expect(await kv.get("queue/1_x")).toEqual(4);
  });

  test("list treats LIKE wildcards literally", async () => {
    const kv = db.services.kvService<number>();
    await kv.put("a_b/1", 1);
    await kv.put("axb/2", 2);
    expect(await kv.list("a_b")).toEqual([1]);
  });
});

describe("lock", () => {
  test("serializes handlers on the same key", async () => {
    const lock = db.services.lockService();
    const events: string[] = [];
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));

    const first = lock.lock("k", async () => {
      events.push("first start");
      await held;
      events.push("first end");
    });
    // Wait until the first handler holds the lock.
    while (!events.length) await new Promise((r) => setTimeout(r, 5));

    await expect(lock.lock("k", async () => {})).rejects.toBeInstanceOf(
      LockError,
    );
    release();
    await first;
    await lock.lock("k", async () => {
      events.push("second");
    });
    expect(events).toEqual(["first start", "first end", "second"]);
  });

  test("holding locks doesn't use up the shared pool", async () => {
    const small = postgresServices({ connectionString: DATABASE_URL, max: 2 });
    const lock = small.services.lockService();
    const kv = small.services.kvService<number>();
    try {
      // More handlers than pool connections, each holding a lock while it
      // queries, like one push deploying to many targets at once.
      await Promise.all(
        ["a", "b", "c", "d"].map((k) =>
          lock.lock(`pool-${k}`, async () => {
            await new Promise((r) => setTimeout(r, 20));
            await kv.get(k);
          }),
        ),
      );
    } finally {
      await small.pool.end();
    }
  });

  test("releases the lock when the handler throws", async () => {
    const lock = db.services.lockService();
    await expect(
      lock.lock("k", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    let ran = false;
    await lock.lock("k", async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });
});

describe("message bus", () => {
  test("publishes with NOTIFY", async () => {
    const listener = new Client({ connectionString: DATABASE_URL });
    await listener.connect();
    await listener.query(`LISTEN ${CHANNEL}`);
    const received = new Promise<any>((resolve) =>
      listener.on("notification", (n) => resolve(JSON.parse(n.payload!))),
    );
    const bus = db.services.messageService<{ id: number }>();
    expect(await bus.subscribe("repos/1", { id: "u" })).toBeUndefined();
    await bus.publish("repos/1", { id: 1 });
    expect(await received).toEqual({ topic: "repos/1", message: { id: 1 } });
    await listener.end();
  });
});

describe("users", () => {
  test("creates, updates and deletes", async () => {
    const users = db.services.userService();
    const created = await users.update({
      id: "1",
      username: "octocat",
      email: "o@example.com",
    });
    expect(created.createdAt).toBeTruthy();
    const updated = await users.update({
      id: "1",
      username: "octocat2",
      email: "",
    });
    expect(updated.createdAt).toEqual(created.createdAt);
    const { rows } = await db.pool.query("SELECT username FROM users");
    expect(rows).toEqual([{ username: "octocat2" }]);
    await users.delete("1");
    expect((await db.pool.query("SELECT * FROM users")).rowCount).toBe(0);
  });

  test("lists users, most recently signed in first", async () => {
    const users = db.services.userService();
    await users.update({ id: "1", username: "first", email: "" });
    await users.update({ id: "2", username: "second", email: "" });
    await users.update({ id: "1", username: "first", email: "" });
    const list = await users.list();
    expect(list.map((u) => u.username)).toEqual(["first", "second"]);
    expect(list[0].createdAt).toBeTruthy();
    expect(list[0].updatedAt).toBeTruthy();
  });

  test("lists repository visits, most recent first", async () => {
    const users = db.services.userService();
    await users.update({ id: "1", username: "octocat", email: "" });
    await users.update({ id: "2", username: "other", email: "" });
    await users.recordVisit("1", { id: 10, fullName: "octocat/a" });
    await users.recordVisit("1", { id: 11, fullName: "octocat/b" });
    await users.recordVisit("2", { id: 12, fullName: "other/c" });
    // A renamed repository keeps one entry, under its new name.
    await users.recordVisit("1", { id: 10, fullName: "octocat/renamed" });
    const visits = await users.recentVisits("1", 5);
    expect(visits.map((v) => [v.id, v.fullName])).toEqual([
      [10, "octocat/renamed"],
      [11, "octocat/b"],
    ]);
    expect(visits[0].visitedAt).toBeTruthy();
    expect(await users.recentVisits("1", 1)).toHaveLength(1);
    await users.delete("1");
    expect(await users.recentVisits("1", 5)).toEqual([]);
    expect(await users.recentVisits("2", 5)).toHaveLength(1);
  });
});

describe("installations", () => {
  test("upserts, reads and deletes", async () => {
    const store = db.services.installationService();
    const i = {
      id: 42,
      account: "octo-org",
      accountType: "Organization",
      repositorySelection: "all",
      suspended: false,
    };
    expect(await store.get(42)).toBeUndefined();
    await store.upsert(i);
    await store.upsert({ ...i, suspended: true });
    expect(await store.get(42)).toEqual({ ...i, suspended: true });
    await store.delete(42);
    expect(await store.get(42)).toBeUndefined();
  });
});

describe("configured repositories", () => {
  test("records, lists and forgets them per installation", async () => {
    const store = db.services.installationService();
    const repo = (id: number, fullName: string) => ({
      id,
      nodeId: `R_${id}`,
      fullName,
    });
    await store.setConfigured(repo(10, "first/b"), 1, true);
    await store.setConfigured(repo(11, "first/a"), 1, true);
    await store.setConfigured(repo(12, "second/a"), 2, true);
    expect(await store.listConfigured(1)).toEqual([
      repo(11, "first/a"),
      repo(10, "first/b"),
    ]);
    // A rename updates the stored name.
    await store.setConfigured(repo(11, "first/c"), 1, true);
    await store.setConfigured(repo(10, "first/b"), 1, false);
    expect(await store.listConfigured(1)).toEqual([repo(11, "first/c")]);

    await store.upsert({
      id: 1,
      account: "first",
      accountType: "User",
      repositorySelection: "all",
      suspended: false,
    });
    expect((await store.list()).find((i) => i.id === 1)).toMatchObject({
      configuredCount: 1,
      configsSyncedAt: null,
    });
    await store.markConfigsSynced(1);
    expect(
      (await store.list()).find((i) => i.id === 1)!.configsSyncedAt,
    ).toBeTruthy();

    await store.forgetRepositories([11]);
    expect(await store.listConfigured(1)).toEqual([]);
    await store.delete(2);
    expect(await store.listConfigured(2)).toEqual([]);
  });
});

describe("repository activity", () => {
  const install = (id: number, account: string) => ({
    id,
    account,
    accountType: "User",
    repositorySelection: "all",
    suspended: false,
  });

  test("lists installations and their latest repository activity", async () => {
    const store = db.services.installationService();
    await store.upsert(install(1, "first"));
    await store.upsert(install(2, "second"));
    const list = await store.list();
    expect(list.map((i) => i.account).sort()).toEqual(["first", "second"]);
    expect(list[0].createdAt).toBeTruthy();
    expect(list[0].repositoryCount).toBeNull();
    await store.setRepositoryCount(1, 7);
    await store.upsert(install(1, "first"));
    const first = (await store.list()).find((i) => i.id === 1)!;
    expect(first.repositoryCount).toBe(7);
    expect(await store.get(1)).toEqual(install(1, "first"));

    await store.recordActivity({
      id: 10,
      installationId: 1,
      fullName: "first/a",
      lastEvent: "push",
    });
    await store.recordActivity({
      id: 11,
      installationId: 1,
      fullName: "first/b",
      lastEvent: "push",
    });
    await store.recordActivity({
      id: 10,
      installationId: 1,
      fullName: "first/a",
      lastEvent: "deployment_status.created",
    });
    await store.recordActivity({
      id: 20,
      installationId: 2,
      fullName: "second/a",
      lastEvent: "push",
    });
    await store.upsert(install(3, "quiet"));
    const listed = await store.list();
    expect(listed.map((i) => i.account)).toEqual(["second", "first", "quiet"]);
    expect(listed[0].lastActivityAt).toBeTruthy();
    expect(listed[2].lastActivityAt).toBeNull();
    expect(await store.get(2)).toEqual(install(2, "second"));

    const activity = await store.listActivity(1);
    expect(activity.map((a) => [a.fullName, a.lastEvent])).toEqual([
      ["first/a", "deployment_status.created"],
      ["first/b", "push"],
    ]);

    await store.forgetRepositories([11]);
    expect((await store.listActivity(1)).map((a) => a.id)).toEqual([10]);

    await store.delete(1);
    expect(await store.listActivity(1)).toEqual([]);
    expect((await store.listActivity(2)).map((a) => a.id)).toEqual([20]);
  });
});

// The in-memory store backs the tests of the other packages, so it should
// answer the same.
describe.each([
  ["postgres", () => db.services.installationService()],
  ["memory", () => localServices().installationService()],
])("deployments (%s)", (_, service) => {
  const hour = 60 * 60 * 1000;
  const at = (hoursAgo: number) =>
    new Date(Date.now() - hoursAgo * hour).toISOString();
  const deployment = (
    id: number,
    installationId: number,
    repositoryId: number,
    hoursAgo: number,
    state?: string,
  ) => ({
    id,
    installationId,
    repositoryId,
    fullName: `owner/repo-${repositoryId}`,
    environment: "production",
    createdAt: at(hoursAgo),
    state,
  });

  test("counts, groups and forgets them", async () => {
    const store = service();
    await store.recordDeployment(deployment(1, 1, 10, 0.5));
    await store.recordDeployment(deployment(2, 1, 10, 2, "success"));
    await store.recordDeployment(deployment(3, 1, 11, 30, "failure"));
    await store.recordDeployment(deployment(4, 2, 20, 0.1, "error"));
    await store.recordDeployment(deployment(5, 2, 20, 24 * 40, "success"));

    // A status without a state, or one after the outcome, changes nothing.
    await store.recordDeployment(deployment(2, 1, 10, 2));
    await store.recordDeployment(deployment(2, 1, 10, 2, "in_progress"));
    await store.recordDeployment(deployment(1, 1, 10, 0.5, "queued"));

    expect(await store.countDeployments(at(1))).toEqual({
      total: 2,
      succeeded: 0,
      failed: 1,
      repositories: 2,
      installations: 2,
    });
    expect(await store.countDeployments(at(24 * 30))).toEqual({
      total: 4,
      succeeded: 1,
      failed: 2,
      repositories: 3,
      installations: 2,
    });

    const daily = await store.dailyDeployments(at(24 * 30));
    expect(daily.reduce((sum, d) => sum + d.total, 0)).toBe(4);
    expect(daily.map((d) => d.day)).toEqual(
      [...daily.map((d) => d.day)].sort(),
    );
    expect(daily[0].day).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const recent = await store.recentDeployments(2);
    expect(recent.map((d) => [d.id, d.state])).toEqual([
      [4, "error"],
      [1, "queued"],
    ]);
    expect(recent[0].fullName).toBe("owner/repo-20");

    const top = await store.topInstallations(at(24 * 30), 10);
    expect(top).toEqual([
      expect.objectContaining({ installationId: 1, total: 3, repositories: 2 }),
      expect.objectContaining({ installationId: 2, total: 1, repositories: 1 }),
    ]);
    // The newest deployment of the installation.
    expect(top[0].lastDeployedAt).toBe(recent[1].createdAt);

    await store.forgetRepositories([11]);
    expect((await store.countDeployments(at(24 * 30))).total).toBe(3);
    await store.delete(2);
    expect((await store.countDeployments(at(24 * 50))).total).toBe(2);
  });
});
