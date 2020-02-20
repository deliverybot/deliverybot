import * as factory from "../factory";
import { app as deliverybot } from "../app";

const app = deliverybot.express;
const json = "application/json; charset=utf-8";

describe("Deploy", () => {
  let session: string;
  let csrf: string;

  beforeAll(async () => {
    await deliverybot.loaded();
  });

  afterEach(() => {
    factory.cleanAll();
  });

  beforeEach(async () => {
    [csrf, session] = await factory.login(app);
    factory.config({ valid: true });
    factory.permission({ admin: true });
    factory.repo();
  });

  it("gets redirected", async () => {
    const response = await factory
      .request(app)
      .get("/Codertocat/Hello-World")
      .set("cookie", session);
    expect(response.status).toBe(302);

    expect(response.get("location")).toBe(
      "/Codertocat/Hello-World/branch/master",
    );
  });

  it("gets metrics", async () => {
    const response = await factory
      .request(app)
      .get("/Codertocat/Hello-World/metrics")
      .set("cookie", session);
    expect(response.status).toBe(200);
  });

  it("gets metrics full", async () => {
    factory.metricsGql();

    const response = await factory
      .request(app)
      .get("/Codertocat/Hello-World/metrics")
      .set("accept", "application/json")
      .set("cookie", session);
    expect(response.status).toBe(200);
    expect(response.get("content-type")).toBe(json);
  });

  it("gets config", async () => {
    const response = await factory
      .request(app)
      .get("/Codertocat/Hello-World/config")
      .set("cookie", session);
    expect(response.status).toBe(200);
  });

  it("gets commits", async () => {
    factory.commitsMinimalGql();

    const response = await factory
      .request(app)
      .get("/Codertocat/Hello-World/branch/master")
      .set("cookie", session);
    expect(response.status).toBe(200);
  });

  it("gets commits full", async () => {
    factory.commitsFullGql();

    const response = await factory
      .request(app)
      .get("/Codertocat/Hello-World/branch/master")
      .set("accept", "application/json")
      .set("cookie", session);
    expect(response.status).toBe(200);
    expect(response.get("content-type")).toBe(json);
  });

  it("watches commits", async () => {
    const response = await factory
      .request(app)
      .get("/Codertocat/Hello-World/branch/master?watch=true")
      .set("cookie", session);
    expect(response.status).toBe(200);
    expect(response.body.watch).toBe(true);
  });

  it("not watch config", async () => {
    const response = await factory
      .request(app)
      .get("/Codertocat/Hello-World/config?watch=true")
      .set("cookie", session);
    expect(response.status).toBe(200);
    expect(response.body.watch).toBe(false);
  });

  it("not watch metrics", async () => {
    const response = await factory
      .request(app)
      .get("/Codertocat/Hello-World/metrics?watch=true")
      .set("cookie", session);
    expect(response.status).toBe(200);
    expect(response.body.watch).toBe(false);
  });

  it("promotes", async () => {
    factory.createStatus("foo");

    const response = await factory
      .request(app)
      .post("/Codertocat/Hello-World/branch/master/o/foo/promote")
      .set("csrf-token", csrf)
      .set("cookie", session)
      .send("target=production");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "Ok" });
  });

  it("fails to promote", async () => {
    factory.commitFullGql();
    factory.errorCreateStatus("foo");

    const response = await factory
      .request(app)
      .post("/Codertocat/Hello-World/branch/master/o/foo/promote")
      .set("csrf-token", csrf)
      .set("cookie", session)
      .send("target=production");
    expect(response.status).toBe(500);
  });

  it("deploys", async () => {
    factory.gitCommit();
    factory.deploymentStatus();
    factory.pr();
    factory.repo();
    factory.permission({ admin: true });
    factory.gitRef();
    const deploy = factory.deploy();

    const response = await factory
      .request(app)
      .post("/Codertocat/Hello-World/branch/master/o/foo")
      .set("csrf-token", csrf)
      .set("cookie", session)
      .send("target=production");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "Ok" });
    expect(deploy.isDone()).toBe(true);
  });

  it("fails to deploy", async () => {
    factory.commitFullGql();
    factory.gitCommit();
    factory.deploymentStatus();
    factory.pr();
    factory.repo();
    factory.permission({ admin: true });
    factory.gitRef();
    const deploy = factory.errorDeploy();

    const response = await factory
      .request(app)
      .post("/Codertocat/Hello-World/branch/master/o/foo")
      .set("csrf-token", csrf)
      .set("cookie", session)
      .send("target=production");
    expect(response.status).toBe(400);
    expect(response.body.status).toBe("BadRequest");
    expect(deploy.isDone()).toBe(true);
  });

  it("locks a deployment", async () => {
    factory.config({ valid: true });
    factory.config({ valid: true });
    factory.commitFullGql();

    const response = await factory
      .request(app)
      .post("/Codertocat/Hello-World/branch/master/lock")
      .set("csrf-token", csrf)
      .set("cookie", session)
      .send("target=production");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "Ok" });
  });

  it("unlocks a deployment", async () => {
    factory.config({ valid: true });
    factory.config({ valid: true });
    factory.commitFullGql();

    const response = await factory
      .request(app)
      .post("/Codertocat/Hello-World/branch/master/lock")
      .set("csrf-token", csrf)
      .set("cookie", session)
      .send("target=production");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "Ok" });
  });
});
