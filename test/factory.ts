// Global environment variable fixes:
process.env.WEBHOOK_SECRET = "fake";

import nock from "nock";
import supertest from "supertest";
import { Probot, Application, Octokit } from "probot";
import { InMemStore } from "../src/store";
import { app } from "../src/app";

// Keep tests clean by exporting mocking tools here;
export { Scope } from "nock";
export { Probot } from "probot";
export const request = supertest;
export const cleanAll = nock.cleanAll;

export const store = new InMemStore();
export const deliverybot = (application: Application) => {
  // Assign plain octokit to remove the plugins (like retries) the GitHub adds
  // by default.
  application['Octokit'] = Octokit;
  app(application, store, store, application.receive.bind(application));
};


export const probot = () => {
  const probot = new Probot({ id: 123, cert: "test" });
  const app = probot.load(deliverybot);
  (app as any).app = {
    getSignedJsonWebToken: (option?: any) => Promise.resolve("test"),
    getInstallationAccessToken: (option: any) => Promise.resolve("test")
  };
  return probot;
}

const fixtures = {
  deployValid: require("./fixtures/deploy-valid"),
  deployInvalid: require("./fixtures/deploy-invalid"),
  deployment: require("./fixtures/deployment.json"),
  commentCreated: require("./fixtures/comment.created.json"),
  pullRequest: require("./fixtures/pull-request.json"),
  push: require("./fixtures/push.json"),
  status: require("./fixtures/status.json"),
  ref: require("./fixtures/ref.json"),
  changeRef: require("./fixtures/change-ref.json"),
  prOpened: require("./fixtures/pull_request.opened.json"),
  prSync: require("./fixtures/pull_request.synchronize.json"),
  prClosed: require("./fixtures/pull_request.closed.json"),
  commit: require("./fixtures/commit.json"),
  checkRunCreated: require("./fixtures/check_run.created.json"),
  commitMinimal: require("./fixtures/query-commit.minimal.json"),
  commitFull: require("./fixtures/query-commit.full.json"),
  commitsMinimal: require("./fixtures/query-commits.minimal.json"),
  commitsFull: require("./fixtures/query-commits.full.json")
};

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

export const changesRef = () =>
  nock("https://api.github.com")
    .get("/repos/Codertocat/Hello-World/git/refs/heads/changes")
    .reply(200, fixtures.changeRef);

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

export const noConfig = () =>
  nock("https://api.github.com")
    .persist()
    .get("/repos/Codertocat/Hello-World/contents/.github/deploy.yml")
    .reply(404);

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

export const deployConflict = () =>
  nock("https://api.github.com")
    .post("/repos/Codertocat/Hello-World/deployments")
    .reply(409, { id: 1 });

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

export const prOpened = (): any => ({
  name: "pull_request",
  payload: fixtures.prOpened
});

export const prSync = (): any => ({
  name: "pull_request",
  payload: fixtures.prSync
});

export const prClosed = (): any => ({
  name: "pull_request",
  payload: fixtures.prClosed
});

// Represents a different sha before push1.
export const push0 = (): any => ({
  name: "push",
  id: "push-event",
  payload: {
    ...fixtures.push,
    before: "333d685c9cb906be7461d0af11708005344454f3",
    after: "a10867b14bb761a232cd80139fbd4c0d33264240"
  }
});

export const push1 = (): any => ({
  name: "push",
  id: "push-event",
  payload: fixtures.push
});

export const push = (): any => ({
  name: "push",
  id: "push-event",
  payload: fixtures.push
});

export const status = (): any => ({
  name: "status",
  id: 'status-event',
  payload: fixtures.status
});

export const checkRun = (): any => ({
  name: "check_run",
  id: 'check-run-event',
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
