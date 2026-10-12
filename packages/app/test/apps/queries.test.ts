import * as factory from "../factory.js";
import { WatchStore } from "@deliverybot/deploybot";
import { services } from "../app.js";
import { commits, SinceDeploy } from "../../src/apps/deploy/queries.js";
import { createRequire } from "module";
import nock from "nock";

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

describe("SinceDeployOffPage", () => {
  // The full fixture with no deployments on the page, and the repository's
  // latest deployment further back.
  const offPage = () => {
    const data = JSON.parse(
      JSON.stringify(require("./../fixtures/query-commits.full.json")),
    );
    data.repository.ref.target.history.edges.forEach((edge: any) => {
      edge.node.deployments.nodes = [];
    });
    data.repository.deployments = {
      nodes: [
        {
          environment: "production",
          createdAt: "2019-09-12T14:00:00Z",
          commitOid: "deployed",
        },
      ],
    };
    return data;
  };
  const head = "43aa699010bb9d3c3a2f5ec841f66f99434e4e0e";
  const run = () =>
    commits(watchStore, "foo", "colinjfw", "deliverybot-example", 1, "master", {
      minimal: false,
    });

  afterEach(() => nock.cleanAll());

  it("counts commits with the compare API", async () => {
    factory.gql(offPage());
    nock("https://api.github.com")
      .get(`/repos/colinjfw/deliverybot-example/compare/deployed...${head}`)
      .query({ per_page: 1 })
      .reply(200, { ahead_by: 312 });
    const result = await run();
    expect(result.sinceDeploy).toMatchObject({
      count: 312,
      commits: "commits",
      environment: "production",
      compareUrl: `https://github.com/colinjfw/deliverybot-example/compare/deployed...${head}`,
    });
  });

  it("is empty when the compare fails", async () => {
    factory.gql(offPage());
    nock("https://api.github.com")
      .get(`/repos/colinjfw/deliverybot-example/compare/deployed...${head}`)
      .query(true)
      .reply(404);
    const result = await run();
    expect(result.sinceDeploy).toBeNull();
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
