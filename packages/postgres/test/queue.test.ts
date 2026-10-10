import { Pool } from "pg";
import { WebhookEvent } from "@deliverybot/core";
import { setup, DATABASE_URL } from "./db";
import { PostgresQueue } from "../src";

let db: Awaited<ReturnType<typeof setup>>;
const queues: PostgresQueue[] = [];

function queue(opts = {}) {
  const q = new PostgresQueue(db.pool, {
    pollInterval: 10,
    retryDelay: 0,
    ...opts,
  });
  queues.push(q);
  return q;
}

function event(n: number, installation?: number): WebhookEvent {
  const payload: any = { n };
  if (installation) payload.installation = { id: installation };
  return { id: `${n}`, name: "push", payload } as any;
}

async function until(fn: () => boolean | Promise<boolean>) {
  for (let i = 0; i < 500; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("timed out");
}

async function jobs() {
  const { rows } = await db.pool.query(
    "SELECT name, state, attempts, last_error FROM jobs ORDER BY id",
  );
  return rows;
}

beforeAll(async () => {
  db = await setup();
});

afterEach(async () => {
  await Promise.all(queues.splice(0).map((q) => q.stop()));
  await db.pool.query("TRUNCATE jobs");
});

afterAll(async () => {
  await db.pool.end();
});

test("runs dispatched events and deletes them", async () => {
  const q = queue();
  const seen: WebhookEvent[] = [];
  await q.dispatcher(event(1));
  await q.dispatcher(event(2));
  q.work(async (e) => {
    seen.push(e);
  });
  await until(async () => (await jobs()).length === 0);
  expect(seen).toEqual([event(1), event(2)]);
});

test("retries failed events, then marks them failed", async () => {
  const q = queue({ maxAttempts: 3 });
  let calls = 0;
  await q.dispatcher(event(1));
  q.work(async () => {
    calls++;
    throw new Error("boom");
  });
  await until(async () => (await jobs())[0].state === "failed");
  expect(calls).toBe(3);
  const [job] = await jobs();
  expect(job.attempts).toBe(3);
  expect(job.last_error).toContain("boom");
});

test("succeeds on a later attempt", async () => {
  const q = queue();
  let calls = 0;
  await q.dispatcher(event(1));
  q.work(async () => {
    if (++calls < 2) throw new Error("once");
  });
  await until(async () => (await jobs()).length === 0);
  expect(calls).toBe(2);
});

test("workers never run the same job twice", async () => {
  const other = new Pool({ connectionString: DATABASE_URL });
  const a = queue();
  const b = new PostgresQueue(other, { pollInterval: 10 });
  const seen: string[] = [];
  for (let i = 0; i < 20; i++) await a.dispatcher(event(i));
  const handler = async (e: WebhookEvent) => {
    await new Promise((r) => setTimeout(r, 5));
    seen.push(e.id);
  };
  a.work(handler);
  b.work(handler);
  await until(async () => (await jobs()).length === 0);
  await b.stop();
  await other.end();
  expect(seen.sort()).toEqual(
    Array.from({ length: 20 }, (_, i) => `${i}`).sort(),
  );
});

test("takes over a job only once its lease expired", async () => {
  await queue().dispatcher(event(1));
  // Simulate a worker that claimed the job and died.
  await db.pool.query(
    "UPDATE jobs SET attempts = 1, locked_until = now() + interval '1 hour'",
  );
  const seen: string[] = [];
  queue().work(async (e) => {
    seen.push(e.id);
  });
  await new Promise((r) => setTimeout(r, 100));
  expect(seen).toEqual([]);
  await db.pool.query("UPDATE jobs SET locked_until = now() - interval '1s'");
  await until(async () => (await jobs()).length === 0);
  expect(seen).toEqual(["1"]);
});

test("stop waits for jobs in progress", async () => {
  const q = queue();
  let finished = false;
  await q.dispatcher(event(1));
  q.work(async () => {
    await new Promise((r) => setTimeout(r, 100));
    finished = true;
  });
  await until(async () => (await jobs())[0]?.attempts === 1);
  await q.stop();
  expect(finished).toBe(true);
});

test("limits how many jobs of one installation run at once", async () => {
  const q = queue({ concurrency: 10, perInstallation: 2 });
  for (let i = 0; i < 6; i++) await q.dispatcher(event(i, 1));
  await q.dispatcher(event(100, 2));
  let running: { [i: string]: number } = {};
  let maxBusy = 0;
  let otherStarted = false;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  q.work(async (e: any) => {
    const inst = e.payload.installation.id;
    running[inst] = (running[inst] || 0) + 1;
    if (inst === 1) maxBusy = Math.max(maxBusy, running[inst]);
    if (inst === 2) otherStarted = true;
    await gate;
    running[inst]--;
  });
  // The other installation starts even though installation 1 has a backlog.
  await until(() => otherStarted);
  expect(running[1]).toBe(2);
  release();
  await until(async () => (await jobs()).length === 0);
  expect(maxBusy).toBe(2);
});
