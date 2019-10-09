import { commits, commit } from "../../src/apps/queries";
import * as factory from "../factory";

const DATE_TO_USE = new Date(1568298661772);
const _Date = Date;
// @ts-ignore
global.Date = jest.fn(() => DATE_TO_USE);
global.Date.UTC = _Date.UTC;
global.Date.parse = _Date.parse;
global.Date.now = _Date.now;

describe("Queries", () => {
  it("runs commit minimal", async () => {
    factory.gql(require("./../fixtures/query-commit.minimal.json"));
    const result = await commit(
      "foo",
      "colinjfw",
      "deliverybot-example",
      "production",
      "master",
      "7665fbf10ae537da98a2f98c3960d7a42e765d9b",
      { minimal: true }
    );
    expect(result).toMatchSnapshot();
  });

  it("runs commit full", async () => {
    factory.gql(require("./../fixtures/query-commit.full.json"));
    const result = await commit(
      "foo",
      "colinjfw",
      "deliverybot-example",
      "production",
      "master",
      "7665fbf10ae537da98a2f98c3960d7a42e765d9b",
      { minimal: false }
    );
    expect(result).toMatchSnapshot();
  });

  it("runs commits minimal", async () => {
    factory.gql(require("./../fixtures/query-commits.minimal.json"));
    const result = await commits(
      "foo",
      "colinjfw",
      "deliverybot-example",
      "production",
      "master",
      { minimal: true }
    );
    expect(result).toMatchSnapshot();
  });

  it("runs commits full", async () => {
    factory.gql(require("./../fixtures/query-commits.full.json"));
    const result = await commits(
      "foo",
      "colinjfw",
      "deliverybot-example",
      "production",
      "master",
      { minimal: false }
    );
    expect(result).toMatchSnapshot();
  });
});
