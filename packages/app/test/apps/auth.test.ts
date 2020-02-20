import * as factory from "../factory";
import { app as deliverybot } from "../app";

const app = deliverybot.express;

describe("Auth", () => {
  it("gets login", async () => {
    const response = await factory.request(app).get("/login");
    expect(response.status).toBe(302);
    expect(response.get("location")).toMatch(/github/);
  });

  it("gets logout", async () => {
    const response = await factory.request(app).get("/logout");
    expect(response.status).toBe(302);
    expect(response.get("location")).toEqual("https://deliverybot.dev");
  });

  it("gets callback", async () => {
    factory.oauthToken();
    factory.currentUser();

    const response = await factory.request(app).get("/login/cb?code=foo");
    expect(response.status).toBe(302);
    expect(response.get("location")).toEqual("/");

    const session = response.get("set-cookie");
    const me = await factory
      .request(app)
      .get("/_/me")
      .set("cookie", session[0]);
    expect(me.body.id).toEqual(1);
  });
});
