import nock from "nock";
import deploybot from "../src";
import { Probot } from "probot";
import * as fs from "fs";

const fixtures = {
  deployValid: fs.readFileSync("./test/fixtures/deploy-valid.yaml").toString(),
  deployInvalid: fs
    .readFileSync("./test/fixtures/deploy-invalid.yaml")
    .toString(),
  deployment: require("./fixtures/deployment.json"),
  commentCreated: JSON.parse(
    fs.readFileSync("./test/fixtures/comment.created.json").toString()
  ),
  pullRequest: JSON.parse(
    fs.readFileSync("./test/fixtures/pull-request.json").toString()
  ),
  push: require("./fixtures/push.json"),
  status: require("./fixtures/status.json"),
  ref: require("./fixtures/ref.json"),
  prClosed: require("./fixtures/pull_request.closed.json"),
};

nock.disableNetConnect();

const mockDeploy = ({
  pr,
  deploy,
  valid
}: {
  pr?: boolean;
  deploy?: boolean;
  valid?: boolean;
}) => {
  nock("https://api.github.com")
    .post("/app/installations/2/access_tokens")
    .reply(200, { token: "test" });
  let deployCall;
  if (deploy) {
    deployCall = nock("https://api.github.com")
      .post("/repos/Codertocat/Hello-World/deployments")
      .reply(200, { id: 1 });
  }
  nock("https://api.github.com")
    .post("/repos/Codertocat/Hello-World/deployments/1/statuses")
    .reply(200);
  nock("https://api.github.com")
    .persist()
    .get("/repos/Codertocat/Hello-World/contents/.github/deploy.yml")
    .query(() => true)
    .reply(200, {
      content: Buffer.from(
        valid ? fixtures.deployValid : fixtures.deployInvalid
      ).toString("base64")
    });
  if (pr) {
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/pulls/2")
      .reply(200, fixtures.pullRequest);
  }
  return deployCall;
};

describe("Deployments", () => {
  jest.setTimeout(30000);
  let probot: any;

  afterEach(() => {
    nock.cleanAll();
  });

  beforeEach(() => {
    probot = new Probot({ id: 123, cert: "test" });
    const app = probot.load(deploybot);
    app.app = {
      getSignedJsonWebToken: (option?: any) => Promise.resolve("test"),
      getInstallationAccessToken: (option: any) => Promise.resolve("test")
    };
  });

  test("creates a deployment when a comment is posted", async done => {
    const payload = {
      ...fixtures.commentCreated,
      comment: { ...fixtures.commentCreated.comment, body: "/deploy review" }
    };
    const deployCall = mockDeploy({ pr: true, valid: true, deploy: true });
    await probot.receive({
      name: "issue_comment",
      payload
    });
    expect(deployCall!.isDone()).toBeTruthy();
    done();
  });

  test("puts an error when the target is invalid", async done => {
    const payload = {
      ...fixtures.commentCreated,
      comment: { ...fixtures.commentCreated.body, body: "/deploy invalid" }
    };
    mockDeploy({ pr: true, valid: true, deploy: false });
    const commentCall = nock("https://api.github.com")
      .post(
        "/repos/Codertocat/Hello-World/issues/2/comments",
        (body: object) => {
          expect(body).toMatchObject({
            body:
              ':rotating_light: Failed to trigger deployment. :rotating_light:\nDeployment target "invalid" does not exist'
          });
          return true;
        }
      )
      .reply(200);
    await probot.receive({
      name: "issue_comment",
      payload
    });
    expect(commentCall.isDone()).toBeTruthy();
    done();
  });

  test("puts an error when the api call fails", async done => {
    const payload = {
      ...fixtures.commentCreated,
      comment: { ...fixtures.commentCreated.comment, body: "/deploy review" }
    };
    mockDeploy({ pr: true, valid: true, deploy: false });
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
    await probot.receive({
      name: "issue_comment",
      payload
    });
    expect(commentCall.isDone()).toBeTruthy();
    done();
  });

  test("puts an error when the file is invalid", async () => {
    const payload = {
      ...fixtures.commentCreated,
      comment: { ...fixtures.commentCreated.comment, body: "/deploy review" }
    };
    mockDeploy({ pr: true, valid: false, deploy: false });
    const commentCall = nock("https://api.github.com")
      .post(
        "/repos/Codertocat/Hello-World/issues/2/comments",
        (body: object) => {
          expect(body).toMatchObject({
            body:
              ':rotating_light: Failed to trigger deployment. :rotating_light:\nconfig.fake is not of a type(s) object'
          });
          return true;
        }
      )
      .reply(200);
    await probot.receive({
      name: "issue_comment",
      payload
    });
    expect(commentCall.isDone()).toBeTruthy();
  });

  test("creates a deployment on push", async () => {
    const deployCall = mockDeploy({ pr: false, valid: true, deploy: true });
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/git/refs/tags/simple-tag")
      .reply(200, fixtures.ref);
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/deployments")
      .query(true)
      .reply(200, []);
    await probot.receive({
      name: "push",
      payload: fixtures.push
    });
    expect(deployCall!.isDone()).toBeTruthy();
  });

  test("creates a deployment on status", async () => {
    const deployCall = mockDeploy({ pr: false, valid: true, deploy: true });
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/git/refs/tags/simple-tag")
      .reply(200, fixtures.ref);
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/deployments")
      .query(true)
      .reply(200, []);
    await probot.receive({
      name: "status",
      payload: fixtures.status
    });
    expect(deployCall!.isDone()).toBeTruthy();
  });

  test("creates a deployment on status if other environment exists", async () => {
    const deployCall = mockDeploy({ pr: false, valid: true, deploy: true });
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/git/refs/tags/simple-tag")
      .reply(200, fixtures.ref);
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/deployments")
      .query(true)
      .reply(200, [{ id: 1, environment: "staging" }]);
    await probot.receive({
      name: "status",
      payload: fixtures.status
    });
    expect(deployCall!.isDone()).toBeTruthy();
  });

  test("creates a deployment on status if other environment exists", async () => {
    const deployCall = mockDeploy({ pr: false, valid: true, deploy: true });
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/git/refs/tags/simple-tag")
      .reply(200, fixtures.ref);
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/deployments")
      .query(true)
      .reply(200, [{ id: 1, environment: "production" }]);
    await probot.receive({
      name: "status",
      payload: fixtures.status
    });
    expect(deployCall!.isDone()).toBeFalsy();
  });

  test("creates deployment closed if a pr is closed", async () => {
    const deployCall = mockDeploy({ pr: false, valid: true, deploy: true });
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/deployments")
      .query(true)
      .reply(200, [{ id: 1, environment: "production", transient_environment: true }]);
    await probot.receive({
      name: "pull_request",
      payload: fixtures.prClosed,
    })
    expect(deployCall!.isDone()).toBeTruthy();
  });

  test("does not creates deployment on pr close for transient", async () => {
    const deployCall = mockDeploy({ pr: false, valid: true, deploy: true });
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/deployments")
      .query(true)
      .reply(200, [{ id: 1, environment: "production", transient_environment: false }]);
    await probot.receive({
      name: "pull_request",
      payload: fixtures.prClosed,
    })
    expect(deployCall!.isDone()).toBeFalsy();
  });

  test("creates a single deployment on pr close per env", async () => {
    // Will fail since mock deployment call is only setup once.
    const deployCall = mockDeploy({ pr: false, valid: true, deploy: true });
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/deployments")
      .query(true)
      .reply(200, [
        { id: 1, environment: "production", transient_environment: false },
        { id: 2, environment: "production", transient_environment: false },
      ]);
    await probot.receive({
      name: "pull_request",
      payload: fixtures.prClosed,
    })
    expect(deployCall!.isDone()).toBeFalsy();
  });
});
