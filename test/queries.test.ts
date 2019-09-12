import { View } from "../src/apps/queries";

const DATE_TO_USE = new Date(1568298661772);
const _Date = Date;
// @ts-ignore
global.Date = jest.fn(() => DATE_TO_USE);
global.Date.UTC = _Date.UTC;
global.Date.parse = _Date.parse;
global.Date.now = _Date.now;

describe("Queries", () => {
  it("renders a payload", () => {
    // Patch the following into apps/queries to generate:
    // writeFileSync("test/query.json", JSON.stringify(result));
    const query = require("./fixtures/query.json");
    expect(
      View("colinjfw", "deliverybot-example", "production", "master", query)
    ).toMatchSnapshot();
  });
});
