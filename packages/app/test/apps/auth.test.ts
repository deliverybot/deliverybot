import nock from "nock";
import * as factory from "../factory.js";
import { app as deliverybot } from "../app.js";

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
    expect(me.body.id).toEqual("1");
  });

  it("signs out when GitHub rejects the token", async () => {
    const [, cookie] = await factory.login(app);
    nock("https://api.github.com")
      .get("/user/installations")
      .reply(401, { message: "Bad credentials" });

    const response = await factory.request(app).get("/").set("cookie", cookie);
    expect(response.status).toBe(302);
    expect(response.get("location")).toEqual("/login");

    const me = await factory.request(app).get("/_/me").set("cookie", cookie);
    expect(me.body.id).toBeNull();
  });

  it("signs out when the token is about to expire", async () => {
    nock("https://github.com")
      .post("/login/oauth/access_token")
      .reply(200, { access_token: "token", expires_in: 30 });
    factory.currentUser();
    const login = await factory.request(app).get("/login/cb?code=foo");
    const cookie = login.get("set-cookie")[0];

    const response = await factory.request(app).get("/").set("cookie", cookie);
    expect(response.status).toBe(302);
    expect(response.get("location")).toEqual("/login");
  });
});
