import { View } from "../src/apps/queries";

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
