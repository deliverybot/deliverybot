import { Client } from "pg";
import { LockError } from "@deliverybot/core";
import { setup, DATABASE_URL } from "./db";
import { migrate } from "../src";
import { CHANNEL } from "../src/message";

let db: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  db = await setup();
});

afterAll(async () => {
  await db.pool.end();
});

beforeEach(async () => {
  await db.pool.query("TRUNCATE kv, users");
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
});
