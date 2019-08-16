import { View } from "../src/apps/deploy"


describe("DeployView", () => {
  it("renders a payload", () => {
    const query = require("./fixtures/query.json")
    expect(View("deliverybot", "example", "master", query.data)).toMatchSnapshot();
  })
})
