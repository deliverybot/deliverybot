import { View } from "../src/apps/queries";

describe("Queries", () => {
  it("renders a payload", () => {
    const query = require("./fixtures/query.json");
    expect(
      View("deliverybot", "example", "production", "master", query.data)
    ).toMatchSnapshot();
  });
});
