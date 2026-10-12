import * as factory from "../factory.js";
import { WatchStore } from "@deliverybot/deploybot";
import { services } from "../app.js";
import { commits, EnvironmentPattern } from "../../src/apps/deploy/queries.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const watchStore = new WatchStore(services.kvService);

global.Date.now = () => 1568298661772;

describe("Queries", () => {
  afterEach(() => {
    (watchStore["store"] as any).clear();
  });

  it("runs commits minimal", async () => {
    factory.gql(require("./../fixtures/query-commits.minimal.json"));
    const result = await commits(
      watchStore,
      "foo",
      "colinjfw",
      "deliverybot-example",
      1,
      "master",
      { minimal: true },
    );
    expect(result).toMatchSnapshot();
  });

  it("runs commits full", async () => {
    factory.gql(require("./../fixtures/query-commits.full.json"));
    const result = await commits(
      watchStore,
      "foo",
      "colinjfw",
      "deliverybot-example",
      1,
      "master",
      { minimal: false },
    );
    expect(result).toMatchSnapshot();
  });

  it("runs commits blank", async () => {
    factory.gql(require("./../fixtures/query-commits.blank.json"));
    const result = await commits(
      watchStore,
      "foo",
      "colinjfw",
      "deliverybot-example",
      1,
      "master",
      { minimal: false },
    );
    expect(result).toMatchSnapshot();
  });
});

describe("EnvironmentPattern", () => {
  it("matches the names a templated environment renders to", () => {
    const pattern = EnvironmentPattern("pr${{ pr }}");
    expect(pattern.test("pr1")).toBe(true);
    expect(pattern.test("pr42")).toBe(true);
    expect(pattern.test("pr")).toBe(false);
    expect(pattern.test("staging")).toBe(false);
  });

  it("matches literal parts exactly", () => {
    const pattern = EnvironmentPattern("app.${{ ref }}");
    expect(pattern.test("app.main")).toBe(true);
    expect(pattern.test("appxmain")).toBe(false);
  });
});
