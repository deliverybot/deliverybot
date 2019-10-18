import * as factory from "../factory";
import { deliverybot } from "../../src";

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
    expect(response.get("location")).toEqual("/");
  });

  it("gets callback", async () => {
    factory.oauthToken();
    factory.currentUser();

    const response = await factory.request(app).get("/login/cb?code=foo");
    expect(response.status).toBe(302);
    expect(response.get("location")).toEqual("/");

    const session = response.get("set-cookie");
    const me = await factory.request(app)
      .get("/me")
      .set("cookie", session[0]);
    expect(me.body.id).toEqual(1);
  });
});
