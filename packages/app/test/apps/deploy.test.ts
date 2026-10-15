import * as factory from "../factory.js";
import { app as deliverybot } from "../app.js";

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
      "/Codertocat/Hello-World/branch/main",
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

  it("lists deployments", async () => {
    const scope = factory.deploymentsGql({ first: 25 });

    const response = await factory
      .request(app)
      .get("/Codertocat/Hello-World/deployments")
      .set("cookie", session);
    expect(response.status).toBe(200);
    expect(scope.isDone()).toBe(true);
    expect(response.text).toContain("Fix all the bugs");
    expect(response.text).toContain("failure");
    expect(response.text).toContain("https://example.com/logs/2");
    expect(response.text).toContain("https://staging.example.com");
    expect(response.text).toContain(
      "/Codertocat/Hello-World/deployments?after&#x3D;Y3Vyc29yOjI%3D",
    );
  });

  it("filters deployments by environment", async () => {
    const scope = factory.deploymentsGql({
      environments: ["production"],
      after: "Y3Vyc29yOjI=",
    });

    const response = await factory
      .request(app)
      .get("/Codertocat/Hello-World/deployments")
      .query({ environment: "production", after: "Y3Vyc29yOjI=" })
      .set("cookie", session);
    expect(response.status).toBe(200);
    expect(scope.isDone()).toBe(true);
    expect(response.text).toContain("Environment: production");
    // Paging keeps the filter.
    expect(response.text).toContain(
      "/Codertocat/Hello-World/deployments?after&#x3D;Y3Vyc29yOjI%3D&amp;environment&#x3D;production",
    );
  });

  it("not watch deployments", async () => {
    const response = await factory
      .request(app)
      .get("/Codertocat/Hello-World/deployments?watch=true")
      .set("cookie", session);
    expect(response.status).toBe(200);
    expect(response.body.watch).toBe(false);
  });

  it("lists active environments", async () => {
    const scope = factory.environmentsGql();

    const response = await factory
      .request(app)
      .get("/Codertocat/Hello-World/environments")
      .set("cookie", session);
    expect(response.status).toBe(200);
    expect(scope.isDone()).toBe(true);
    // The active deployment, not the newer failed one.
    expect(response.text).toContain("Ship the feature");
    expect(response.text).toContain("https://www.example.com");
    expect(response.text).toContain("https://example.com/logs/3");
    expect(response.text).toContain("newer deploy failure");
    expect(response.text).toContain("https://staging.example.com");
    expect(response.text).toContain(
      "/Codertocat/Hello-World/deployments?environment&#x3D;production",
    );
    // Torn down environments aren't listed.
    expect(response.text).not.toContain("pr-12");
  });

  it("not watch environments", async () => {
    const response = await factory
      .request(app)
      .get("/Codertocat/Hello-World/environments?watch=true")
      .set("cookie", session);
    expect(response.status).toBe(200);
    expect(response.body.watch).toBe(false);
  });

  it("gets config", async () => {
    const response = await factory
      .request(app)
      .get("/Codertocat/Hello-World/config")
      .set("cookie", session);
    expect(response.status).toBe(200);
  });

  it("reads the config from the default branch", async () => {
    factory.cleanAll();
    factory.permission({ admin: true });
    factory.repo();
    const config = factory.config({ valid: true, ref: "refs/heads/main" });

    const response = await factory
      .request(app)
      .get("/Codertocat/Hello-World/config")
      .set("cookie", session);
    expect(response.status).toBe(200);
    expect(config.isDone()).toBe(true);
  });

  it("links to adding a config on the default branch", async () => {
    factory.cleanAll();
    factory.permission({ admin: true });
    factory.repo();
    factory.noConfig();

    const response = await factory
      .request(app)
      .get("/Codertocat/Hello-World/config")
      .set("cookie", session);
    expect(response.status).toBe(200);
    expect(response.text).toContain(
      "https://github.com/Codertocat/Hello-World/new/main?filename",
    );
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

  it("rejects a request without a csrf token", async () => {
    const response = await factory
      .request(app)
      .post("/Codertocat/Hello-World/branch/master/o/foo/promote")
      .set("cookie", session)
      .send("target=production");
    expect(response.status).toBe(403);
  });

  it("rejects a request with the wrong csrf token", async () => {
    const response = await factory
      .request(app)
      .post("/Codertocat/Hello-World/branch/master/o/foo/promote")
      .set("csrf-token", "x".repeat(csrf.length))
      .set("cookie", session)
      .send("target=production");
    expect(response.status).toBe(403);
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
