import nock from "nock";
import * as factory from "../factory";
import request from "supertest";
import { Application } from "express";
import { Application as ProbotApp } from "probot";

function loaded(robot: ProbotApp) {
  return new Promise((resolve, reject) => {
    robot.events.on('app.partials-loaded', () => {
      resolve();
    });
  });
}

describe("Deploy", () => {
  let app: Application;
  let session: string;

  afterEach(() => {
    nock.cleanAll();
  });

  beforeEach(async () => {
    const probot = factory.probot()
    app = probot.bot.server;
    session = await factory.login(app);
    factory.config({ valid: true });
    factory.permission({ admin: true });
    factory.repo();
    await loaded(probot.app);
  });

  it("gets commits", async () => {
    factory.commitsMinimalGql();

    const response = await request(app)
      .get("/Codertocat/Hello-World/target/production/branch/master")
      .set("cookie", session);
    expect(response.status).toBe(200);
  });

  it("gets commits full", async () => {
    factory.commitsFullGql();

    const response = await request(app)
      .get("/Codertocat/Hello-World/target/production/branch/master")
      .set("cookie", session);
    expect(response.status).toBe(200);
  });

  it("gets commit", async () => {
    factory.commitMinimalGql();

    const response = await request(app)
      .get("/Codertocat/Hello-World/target/production/branch/master/o/foobar")
      .set("cookie", session);
    expect(response.status).toBe(200);
  });

  it("gets commit", async () => {
    factory.commitFullGql();

    const response = await request(app)
      .get("/Codertocat/Hello-World/target/production/branch/master/o/foobar")
      .set("cookie", session);
    expect(response.status).toBe(200);
  });
});
