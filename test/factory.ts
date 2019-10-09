import nock from "nock";
import request from "supertest";
import deploybot from "../src";
import { Probot, Application as ProbotApp } from "probot";
import { Application } from "express";

// nock.disableNetConnect();

const fixtures = {
  deployValid: require("./fixtures/deploy-valid"),
  deployInvalid: require("./fixtures/deploy-invalid"),
  deployment: require("./fixtures/deployment.json"),
  commentCreated: require("./fixtures/comment.created.json"),
  pullRequest: require("./fixtures/pull-request.json"),
  push: require("./fixtures/push.json"),
  status: require("./fixtures/status.json"),
  ref: require("./fixtures/ref.json"),
  prClosed: require("./fixtures/pull_request.closed.json"),
  commit: require("./fixtures/commit.json"),
  checkRunCreated: require("./fixtures/check_run.created.json"),
  commitMinimal: require("./fixtures/query-commit.minimal.json"),
  commitFull: require("./fixtures/query-commit.full.json"),
  commitsMinimal: require("./fixtures/query-commits.minimal.json"),
  commitsFull: require("./fixtures/query-commits.full.json"),
};

export const login = async (app: Application) => {
  oauthToken();
  currentUser();

  const response = await request(app).get("/login/cb?code=foo");
  return response.get("set-cookie")[0];
};

export const oauthToken = () =>
  nock("https://github.com")
    .post("/login/oauth/access_token")
    .reply(200, { access_token: "token" });

export const currentUser = () =>
  nock("https://api.github.com")
    .get("/user")
    .reply(200, { id: 1, login: "Codertocat" });

export const gql = (data: any) =>
  nock("https://api.github.com")
    .post("/graphql")
    .reply(200, { data });

export const commitMinimalGql = () => gql(fixtures.commitMinimal);
export const commitFullGql = () => gql(fixtures.commitFull);
export const commitsMinimalGql = () => gql(fixtures.commitsMinimal);
export const commitsFullGql = () => gql(fixtures.commitsFull);

export const gitRef = () =>
  nock("https://api.github.com")
    .get("/repos/Codertocat/Hello-World/git/refs/tags/simple-tag")
    .reply(200, fixtures.ref);

export const noDeployments = () =>
  nock("https://api.github.com")
    .get("/repos/Codertocat/Hello-World/deployments")
    .query(true)
    .reply(200, []);

export const deploymentsExist = (env: string) =>
  nock("https://api.github.com")
    .get("/repos/Codertocat/Hello-World/deployments")
    .query(true)
    .reply(200, [{ id: 1, environment: env }]);

export const withDeployments = (deployments: any[]) =>
  nock("https://api.github.com")
    .get("/repos/Codertocat/Hello-World/deployments")
    .query(true)
    .reply(200, deployments);

export const token = () =>
  nock("https://api.github.com")
    .post("/app/installations/2/access_tokens")
    .reply(200, { token: "test" });

export const gitCommit = () =>
  nock("https://api.github.com/")
    .get(/\/git\/commits\//)
    .reply(200, fixtures.commit);

export const deploymentStatus = () =>
  nock("https://api.github.com")
    .post("/repos/Codertocat/Hello-World/deployments/1/statuses")
    .reply(200);

export const permission = ({ admin }: { admin: boolean }) =>
  nock("https://api.github.com")
    .get("/repos/Codertocat/Hello-World/collaborators/Codertocat/permission")
    .reply(200, { permission: admin ? "admin" : "read" });

export const config = ({ valid }: { valid?: boolean }) =>
  nock("https://api.github.com")
    .persist()
    .get("/repos/Codertocat/Hello-World/contents/.github/deploy.yml")
    .query(() => true)
    .reply(200, {
      content: Buffer.from(
        valid ? fixtures.deployValid : fixtures.deployInvalid
      ).toString("base64")
    });

export const repo = () =>
  nock("https://api.github.com")
    .get("/repos/Codertocat/Hello-World")
    .reply(200, { id: 1 });

export const pr = () =>
  nock("https://api.github.com")
    .get("/repos/Codertocat/Hello-World/pulls/2")
    .reply(200, fixtures.pullRequest);

export const deploy = () =>
  nock("https://api.github.com")
    .post("/repos/Codertocat/Hello-World/deployments")
    .reply(200, { id: 1 });

export const errorDeploy = () =>
  nock("https://api.github.com")
    .post("/repos/Codertocat/Hello-World/deployments")
    .reply(400, { message: "API error" });

export const prDeployComment = (env: string): any => ({
  name: "issue_comment",
  payload: {
    ...fixtures.commentCreated,
    comment: { ...fixtures.commentCreated.comment, body: `/deploy ${env}` }
  }
});

export const prClosed = (): any => ({
  name: "pull_request",
  payload: fixtures.prClosed
});

export const push = (): any => ({
  name: "push",
  payload: fixtures.push
});

export const status = (): any => ({
  name: "status",
  payload: fixtures.status
});

export const checkRun = (): any => ({
  name: "check_run",
  payload: fixtures.checkRunCreated
});

export const errorComment = (expected: string) =>
  nock("https://api.github.com")
    .post("/repos/Codertocat/Hello-World/issues/2/comments", (body: object) => {
      expect(body).toMatchObject({
        body: expected
      });
      return true;
    })
    .reply(200);

export const probot = (): {
  app: ProbotApp,
  bot: Probot,
} => {
  const bot = new Probot({ id: 123, cert: "test" }) as any;
  const app = bot.load(deploybot);
  app.app = {
    getSignedJsonWebToken: (option?: any) => Promise.resolve("test"),
    getInstallationAccessToken: (option: any) => Promise.resolve("test")
  };
  return { app, bot };
};
