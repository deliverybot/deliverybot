import * as factory from "../factory";
import { WatchStore } from "@deliverybot/deploybot";
import { services } from "../app";
import { commits } from "../../src/apps/deploy/queries";

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
