import nock from "nock";
import * as factory from "../factory";
import request from "supertest";
import { Application } from "express";

describe("Auth", () => {
  let app: Application;

  afterEach(() => {
    nock.cleanAll();
  });

  beforeEach(() => {
    app = factory.probot().bot.server;
  });

  it("gets login", async () => {
    const response = await request(app).get("/login");
    expect(response.status).toBe(302);
    expect(response.get("location")).toMatch(/github/);
  });

  it("gets logout", async () => {
    const response = await request(app).get("/logout");
    expect(response.status).toBe(302);
    expect(response.get("location")).toEqual("/");
  });

  it("gets callback", async () => {
    factory.oauthToken();
    factory.currentUser();

    const response = await request(app).get("/login/cb?code=foo");
    expect(response.status).toBe(302);
    expect(response.get("location")).toEqual("/");

    const session = response.get("set-cookie");
    const me = await request(app)
      .get("/me")
      .set("cookie", session[0]);
    expect(me.body.id).toEqual(1);
  });
});
