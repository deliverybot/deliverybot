import * as factory from "../factory.js";
import { createHmac } from "crypto";
import { app as deliverybot } from "../app.js";

const app = deliverybot.express;
const body = JSON.stringify({ zen: "Keep it logically awesome." });
const sign = (payload: string) =>
  "sha256=" + createHmac("sha256", "foobar").update(payload).digest("hex");

describe("Webhooks", () => {
  it("accepts a signed event", async () => {
    await factory
      .request(app)
      .post("/events")
      .set("content-type", "application/json")
      .set("x-github-delivery", "1")
      .set("x-github-event", "ping")
      .set("x-hub-signature-256", sign(body))
      .send(body)
      .expect(200);
  });

  it("rejects a bad signature", async () => {
    await factory
      .request(app)
      .post("/events")
      .set("content-type", "application/json")
      .set("x-github-delivery", "1")
      .set("x-github-event", "ping")
      .set("x-hub-signature-256", sign("other"))
      .send(body)
      .expect(401);
  });

  it("rejects an unsigned event", async () => {
    await factory
      .request(app)
      .post("/events")
      .set("content-type", "application/json")
      .set("x-github-delivery", "1")
      .set("x-github-event", "ping")
      .send(body)
      .expect(400);
  });
});
