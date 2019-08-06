import nock from "nock";
import deploybot from "../src";
import { Probot } from "probot";
import * as fs from "fs";

const fixtures = {
  deploy: fs.readFileSync("./test/fixtures/deploy-valid.yaml").toString(),
  deployment: JSON.parse(
    fs.readFileSync("./test/fixtures/deployment.json").toString()
  ),
  pullRequestClosed: JSON.parse(
    fs.readFileSync("./test/fixtures/pull_request.closed.json").toString()
  )
};

nock.disableNetConnect();

describe("Deployment Provider", () => {
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

  test("handles a successful deployment", async done => {
    nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, { token: "test" });
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/contents/.github/deploy.yml")
      .query(true)
      .reply(200, {
        content: Buffer.from(fixtures.deploy).toString("base64")
      });
    const deployCall = nock("https://api.github.com")
      .post(
        "/repos/Codertocat/Hello-World/deployments/87972451/statuses",
        (body: any) => {
          expect(["pending", "success"]).toContain(body.state);
          return true;
        }
      )
      .times(1)
      .reply(200);
    const statusCall = nock("https://api.github.com")
      .post(
        "/repos/Codertocat/Hello-World/statuses/a10867b14bb761a232cd80139fbd4c0d33264240"
      )
      .times(1)
      .reply(200);

    await probot.receive({
      name: "deployment",
      payload: fixtures.deployment
    });
    expect(deployCall.isDone()).toBeTruthy();
    expect(statusCall.isDone()).toBeTruthy();
    done();
  });

  test("handles closing a pull request", async done => {
    nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, { token: "test" });
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/contents/.github/deploy.yml")
      .query(true)
      .reply(200, {
        content: Buffer.from(fixtures.deploy).toString("base64")
      });
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/deployments")
      .query(true)
      .reply(200, [
        {
          id: 87972451,
          environment: "pr123",
          transient_environment: true,
          sha: "a10867b14bb761a232cd80139fbd4c0d33264240",
          payload: {
            exec: {}
          }
        }
      ]);
    const deployCall = nock("https://api.github.com")
      .post(
        "/repos/Codertocat/Hello-World/deployments/87972451/statuses",
        (body: any) => {
          expect(body.state).toEqual("inactive");
          return true;
        }
      )
      .reply(200);

    await probot.receive({
      name: "pull_request",
      payload: fixtures.pullRequestClosed
    });
    expect(deployCall.isDone()).toBeTruthy();
    done();
  });

  test("doesn't handle deployment without exec", async done => {
    nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, { token: "test" });
    nock("https://api.github.com")
      .get("/repos/Codertocat/Hello-World/contents/.github/deploy.yml")
      .query(true)
      .reply(200, {
        content: Buffer.from(fixtures.deploy).toString("base64")
      });

    const payload = { ...fixtures.deployment };
    payload.deployment.payload = { url: "foo" }; // No exec.

    await probot.receive({
      name: "deployment",
      payload
    });
    done();
  });
});
