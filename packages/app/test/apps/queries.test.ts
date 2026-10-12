import * as factory from "../factory.js";
import { WatchStore } from "@deliverybot/deploybot";
import { services } from "../app.js";
import { commits, SinceDeploy } from "../../src/apps/deploy/queries.js";
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

describe("SinceDeploy", () => {
  const commit = (oid: string, deployedAt?: number) => ({
    oid,
    deployment: {
      lastDeployedAt: deployedAt,
      lastDeployedAtWords: deployedAt ? "2 hours ago" : undefined,
    },
    deployments: deployedAt ? [{ environment: "production" }] : [],
  });

  it("counts commits above the last deployed one", () => {
    const commits = [commit("c"), commit("b"), commit("a", 1)];
    expect(SinceDeploy("o", "r", commits, commits[2])).toEqual({
      count: 2,
      commits: "commits",
      environment: "production",
      deployedAtWords: "2 hours ago",
      compareUrl: "https://github.com/o/r/compare/a...c",
    });
  });

  it("has no compare link when the head is deployed", () => {
    const commits = [commit("b", 1), commit("a")];
    const since = SinceDeploy("o", "r", commits, commits[0]);
    expect(since).toMatchObject({ count: 0, compareUrl: null });
  });

  it("is empty without a deployed commit", () => {
    expect(SinceDeploy("o", "r", [commit("a")], undefined)).toBeNull();
  });
});
