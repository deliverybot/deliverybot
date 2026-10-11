import * as factory from "../factory.js";
import { app as deliverybot } from "../app.js";

const app = deliverybot.express;

describe("Health", () => {
  it("answers without a session", async () => {
    const response = await factory.request(app).get("/healthz");
    expect(response.status).toBe(200);
    expect(response.text).toEqual("ok");
    expect(response.get("set-cookie")).toBeUndefined();
  });
});
