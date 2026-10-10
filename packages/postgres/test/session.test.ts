import session from "express-session";
import { EncryptedStore } from "@deliverybot/core";
import { setup } from "./db";

let db: Awaited<ReturnType<typeof setup>>;
let store: session.Store;

beforeAll(async () => {
  db = await setup();
  await db.pool.query("TRUNCATE session");
  store = new EncryptedStore(pgStore(), "secret");
});

afterAll(async () => {
  await db.pool.end();
});

const pgStore = () => db.sessionStore({ pruneSessionInterval: false });

const call = <T>(fn: (cb: (err: any, val?: T) => void) => void) =>
  new Promise<T | undefined>((resolve, reject) =>
    fn((err, val) => (err ? reject(err) : resolve(val))),
  );

const cookie = () => {
  const c = new session.Cookie();
  c.maxAge = 60000;
  return c;
};

test("stores sessions encrypted", async () => {
  await call((cb) =>
    store.set("sid1", { cookie: cookie(), token: "gho_secret" } as any, cb),
  );
  const { rows } = await db.pool.query(
    "SELECT sess::text AS raw FROM session WHERE sid = 'sid1'",
  );
  expect(rows[0].raw).not.toContain("gho_secret");

  const sess: any = await call((cb) => store.get("sid1", cb));
  expect(sess.token).toEqual("gho_secret");
  expect(sess.cookie.originalMaxAge).toEqual(60000);
});

test("treats sessions sealed with another secret as missing", async () => {
  await call((cb) =>
    store.set("sid2", { cookie: cookie(), token: "t" } as any, cb),
  );
  const other = new EncryptedStore(pgStore(), "other");
  expect(await call((cb) => other.get("sid2", cb))).toBeNull();
});

test("destroys sessions", async () => {
  await call((cb) =>
    store.set("sid3", { cookie: cookie(), token: "t" } as any, cb),
  );
  await call((cb) => store.destroy("sid3", cb));
  expect(await call((cb) => store.get("sid3", cb))).toBeFalsy();
});
