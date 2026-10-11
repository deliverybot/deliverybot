import crypto from "crypto";
import nock from "nock";
import * as factory from "../factory.js";
import { app as deliverybot, services } from "../app.js";

const app = deliverybot.express;
const kv = services.kvService<any>();

function sign(body: string, secret = "slack-signing") {
  const timestamp = `${Math.floor(Date.now() / 1000)}`;
  const hash = crypto
    .createHmac("sha256", secret)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex");
  return { timestamp, signature: `v0=${hash}` };
}

function command(text: string, userId = "U1", secret?: string) {
  const body = new URLSearchParams({
    text,
    team_id: "T1",
    user_id: userId,
    response_url: "https://hooks.slack.test/response",
  }).toString();
  const { timestamp, signature } = sign(body, secret);
  return factory
    .request(app)
    .post("/slack/command")
    .set("content-type", "application/x-www-form-urlencoded")
    .set("x-slack-request-timestamp", timestamp)
    .set("x-slack-signature", signature)
    .send(body);
}

describe("Slack", () => {
  afterEach(() => factory.cleanAll());

  it("signs in with Slack and links the GitHub account", async () => {
    const install = await factory.request(app).get("/slack/install");
    expect(install.status).toBe(302);
    const authorize = new URL(install.get("location"));
    expect(authorize.origin + authorize.pathname).toBe(
      "https://slack.com/oauth/v2/authorize",
    );
    expect(authorize.searchParams.get("scope")).toBe("commands");
    expect(authorize.searchParams.get("redirect_uri")).toBe(
      "https://deliverybot.test/slack/callback",
    );
    const state = authorize.searchParams.get("state");
    let cookie = install.get("set-cookie")[0];

    nock("https://slack.com")
      .post("/api/oauth.v2.access", (body) => body.code === "abc")
      .reply(200, { ok: true, authed_user: { id: "ULINK" } });
    const callback = await factory
      .request(app)
      .get(`/slack/callback?code=abc&state=${state}`)
      .set("cookie", cookie);
    expect(callback.status).toBe(200);

    const associate = await factory
      .request(app)
      .get("/slack/associate")
      .set("cookie", cookie);
    expect(associate.get("location")).toBe("/login");

    nock("https://github.com").post("/login/oauth/access_token").reply(200, {
      access_token: "token",
      refresh_token: "refresh",
      expires_in: 28800,
    });
    factory.currentUser();
    const login = await factory
      .request(app)
      .get("/login/cb?code=foo")
      .set("cookie", cookie);
    expect(login.get("location")).toBe("/slack/associate");
    cookie = login.get("set-cookie")[0];

    const linked = await factory
      .request(app)
      .get("/slack/associate")
      .set("cookie", cookie);
    expect(linked.status).toBe(200);
    const stored = await kv.get("slack/ULINK");
    expect(stored.github).toMatchObject({
      id: "1",
      username: "Codertocat",
      token: "token",
      refreshToken: "refresh",
    });
  });

  it("rejects a Slack callback without the state it started with", async () => {
    const response = await factory
      .request(app)
      .get("/slack/callback?code=abc&state=forged");
    expect(response.status).toBe(302);
    expect(response.get("location")).toBe("/slack/install");
  });

  it("rejects commands with a bad signature", async () => {
    const response = await command("help", "U1", "wrong");
    expect(response.status).toBe(400);
  });

  it("asks unknown users to log in", async () => {
    const response = await command("help", "UNKNOWN");
    expect(response.status).toBe(200);
    expect(response.body.attachments[0].actions[0].url).toBe(
      "https://deliverybot.test/slack/install",
    );
  });

  it("answers help for linked users", async () => {
    await kv.put("slack/UHELP", {
      slack: { id: "UHELP" },
      github: { id: "1", username: "Codertocat", token: "token" },
    });
    const response = await command("help", "UHELP");
    expect(response.status).toBe(200);
    expect(response.body.text).toMatch(/Deliverybot Slack app/);
  });

  it("refreshes an expired GitHub token", async () => {
    await kv.put("slack/UEXP", {
      slack: { id: "UEXP" },
      github: {
        id: "1",
        username: "Codertocat",
        token: "old",
        refreshToken: "refresh",
        expiresAt: Date.now() - 1000,
      },
    });
    nock("https://github.com")
      .post(
        "/login/oauth/access_token",
        (body) =>
          body.grant_type === "refresh_token" &&
          body.refresh_token === "refresh",
      )
      .reply(200, {
        access_token: "new",
        refresh_token: "refresh2",
        expires_in: 28800,
      });
    const response = await command("help", "UEXP");
    expect(response.body.text).toMatch(/Deliverybot Slack app/);
    const stored = await kv.get("slack/UEXP");
    expect(stored.github.token).toBe("new");
    expect(stored.github.refreshToken).toBe("refresh2");
  });

  it("asks users to log in again when the token can't be refreshed", async () => {
    await kv.put("slack/UDEAD", {
      slack: { id: "UDEAD" },
      github: {
        id: "1",
        username: "Codertocat",
        token: "old",
        expiresAt: Date.now() - 1000,
      },
    });
    const response = await command("help", "UDEAD");
    expect(response.body.text).toMatch(/connect your GitHub account/);
  });
});
