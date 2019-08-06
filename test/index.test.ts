import nock from "nock";
import deploybot from "../src";
import { Probot } from "probot";
import * as fs from "fs";

const fixtures = {
  deployValid: fs.readFileSync("./test/fixtures/deploy-valid.yaml").toString(),
  deployInvalid: fs
    .readFileSync("./test/fixtures/deploy-invalid.yaml")
    .toString(),
  commentCreated: JSON.parse(
    fs.readFileSync("./test/fixtures/comment.created.json").toString()
  ),
  pullRequest: JSON.parse(
    fs.readFileSync("./test/fixtures/pull-request.json").toString()
  ),
  push: JSON.parse(fs.readFileSync("./test/fixtures/push.json").toString()),
  status: JSON.parse(fs.readFileSync("./test/fixtures/status.json").toString()),
  ref: JSON.parse(fs.readFileSync("./test/fixtures/ref.json").toString())
};

nock.disableNetConnect();

describe("Deployments", () => {
  jest.setTimeout(30000);
  let probot: any;

  beforeEach(() => {
    probot = new Probot({ id: 123, cert: "test" });
    const app = probot.load(deploybot);
    app.app = {
      getSignedJsonWebToken: (option?: any) => Promise.resolve("test"),
      getInstallationAccessToken: (option: any) => Promise.resolve("test")
    };
  });

  test("creates a deployment when a comment is posted", async () => {
    const payload = {
      ...fixtures.commentCreated,
      comment: { ...fixtures.commentCreated.comment, body: "/deploy review" }
    };
    nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, { token: "test" });
    const deployCall = nock("https://api.github.com")
      .post("/repos/Codertocat/Hello-World/deployments")
      .reply(200);
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/pulls/2")
      .reply(200, fixtures.pullRequest);
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/contents/.github/deploy.yml")
      .query(true)
      .reply(200, {
        content: Buffer.from(fixtures.deployValid).toString("base64")
      });

    // Receive a webhook event
    await probot.receive({
      name: "issue_comment",
      payload
    });
    expect(deployCall.isDone()).toBeTruthy();
  });

  test("puts an error when the target is invalid", async () => {
    const payload = {
      ...fixtures.commentCreated,
      comment: { ...fixtures.commentCreated.body, body: "/deploy invalid" }
    };
    nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, { token: "test" });
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/contents/.github/deploy.yml")
      .query(true)
      .reply(200, {
        content: Buffer.from(fixtures.deployValid).toString("base64")
      });
    const commentCall = nock("https://api.github.com")
      .post(
        "/repos/Codertocat/Hello-World/issues/2/comments",
        (body: object) => {
          expect(body).toMatchObject({
            body:
              ':rotating_light: Deployment "/deploy invalid" found no target. :rotating_light:'
          });
          return true;
        }
      )
      .reply(200);
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/pulls/2")
      .reply(200, fixtures.pullRequest);

    // Receive a webhook event
    await probot.receive({
      name: "issue_comment",
      payload
    });
    expect(commentCall.isDone()).toBeTruthy();
  });

  test("puts an error when the api call fails", async () => {
    const payload = {
      ...fixtures.commentCreated,
      comment: { ...fixtures.commentCreated.comment, body: "/deploy review" }
    };
    nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, { token: "test" });
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/contents/.github/deploy.yml")
      .query(true)
      .reply(200, {
        content: Buffer.from(fixtures.deployValid).toString("base64")
      });
    nock("https://api.github.com")
      .post("/repos/Codertocat/Hello-World/deployments")
      .reply(400, { message: "API error" });
    const commentCall = nock("https://api.github.com")
      .post(
        "/repos/Codertocat/Hello-World/issues/2/comments",
        (body: object) => {
          expect(body).toMatchObject({
            body:
              ":rotating_light: Failed to trigger deployment. :rotating_light:\nAPI error"
          });
          return true;
        }
      )
      .reply(200);
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/pulls/2")
      .reply(200, fixtures.pullRequest);

    // Receive a webhook event
    await probot.receive({
      name: "issue_comment",
      payload
    });
    expect(commentCall.isDone()).toBeTruthy();
  });

  test("puts an error when the file is invalid", async () => {
    const payload = {
      ...fixtures.commentCreated,
      comment: { ...fixtures.commentCreated.comment, body: "/deploy review" }
    };
    nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, { token: "test" });
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/contents/.github/deploy.yml")
      .query(true)
      .reply(200, {
        content: Buffer.from(fixtures.deployInvalid).toString("base64")
      });
    const commentCall = nock("https://api.github.com")
      .post(
        "/repos/Codertocat/Hello-World/issues/2/comments",
        (body: object) => {
          expect(body).toMatchObject({
            body:
              ':rotating_light: Deployment "/deploy review" found no target. :rotating_light:'
          });
          return true;
        }
      )
      .reply(200);
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/pulls/2")
      .reply(200, fixtures.pullRequest);

    // Receive a webhook event
    await probot.receive({
      name: "issue_comment",
      payload
    });
    expect(commentCall.isDone()).toBeTruthy();
  });

  test("creates a deployment on push", async () => {
    nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, { token: "test" });
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/contents/.github/deploy.yml")
      .query(true)
      .reply(200, {
        content: Buffer.from(fixtures.deployValid).toString("base64")
      });
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/git/refs/tags/simple-tag")
      .reply(200, fixtures.ref);
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/deployments")
      .query(true)
      .reply(200, []);
    const deployCall = nock("https://api.github.com")
      .post("/repos/Codertocat/Hello-World/deployments")
      .reply(200);

    await probot.receive({
      name: "push",
      payload: fixtures.push
    });
    expect(deployCall.isDone()).toBeTruthy();
  });

  test("creates a deployment on status", async () => {
    nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, { token: "test" });
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/contents/.github/deploy.yml")
      .query(true)
      .reply(200, {
        content: Buffer.from(fixtures.deployValid).toString("base64")
      });
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/git/refs/tags/simple-tag")
      .reply(200, fixtures.ref);
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/deployments")
      .query(true)
      .reply(200, []);
    const deployCall = nock("https://api.github.com")
      .post("/repos/Codertocat/Hello-World/deployments")
      .reply(200);

    await probot.receive({
      name: "status",
      payload: fixtures.status
    });
    expect(deployCall.isDone()).toBeTruthy();
  });

  test("creates a deployment on status if other environment exists", async () => {
    nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, { token: "test" });
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/contents/.github/deploy.yml")
      .query(true)
      .reply(200, {
        content: Buffer.from(fixtures.deployValid).toString("base64")
      });
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/git/refs/tags/simple-tag")
      .reply(200, fixtures.ref);
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/deployments")
      .query(true)
      .reply(200, [
        {
          id: 1,
          environment: "staging"
        }
      ]);
    const deployCall = nock("https://api.github.com")
      .post("/repos/Codertocat/Hello-World/deployments")
      .reply(200);

    await probot.receive({
      name: "status",
      payload: fixtures.status
    });
    expect(deployCall.isDone()).toBeTruthy();
  });

  test("does not create a deployment on status if other deploy exists", async () => {
    nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, { token: "test" });
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/contents/.github/deploy.yml")
      .query(true)
      .reply(200, {
        content: Buffer.from(fixtures.deployValid).toString("base64")
      });
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/git/refs/tags/simple-tag")
      .reply(200, fixtures.ref);
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/deployments")
      .query(true)
      .reply(200, [
        {
          id: 1,
          environment: "production"
        }
      ]);
    const deployCall = nock("https://api.github.com")
      .post("/repos/Codertocat/Hello-World/deployments")
      .reply(200);

    await probot.receive({
      name: "status",
      payload: fixtures.status
    });
    expect(deployCall.isDone()).toBeFalsy();
  });
});
