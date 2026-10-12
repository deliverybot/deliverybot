import nock from "nock";
import * as factory from "../factory.js";
import { app } from "../app.js";
import { checkState } from "../../src/check-run.js";

const probot = app.probot;
const sha = factory.fixtures.deployment.deployment.sha;

const configWith = (checkRun: boolean) =>
  nock("https://api.github.com")
    .persist()
    .get(
      /^\/repos\/Codertocat\/Hello-World\/contents\/\.github(\/|%2F)deploy\.yml/,
    )
    .query(() => true)
    .reply(200, {
      content: Buffer.from(
        `production:\n  environment: production\n  check_run: ${checkRun}\n`,
      ).toString("base64"),
    });

const deployment = (payload: any = { target: "production" }) => ({
  ...factory.fixtures.deployment.deployment,
  payload,
});

const deploymentCreated = (payload?: any): any => ({
  name: "deployment",
  payload: {
    ...factory.fixtures.deployment,
    action: "created",
    deployment: deployment(payload),
  },
});

const deploymentStatus = (state: string, extra: any = {}): any => ({
  name: "deployment_status",
  payload: {
    ...factory.fixtures.deployment,
    action: "created",
    deployment: deployment(),
    deployment_status: { state, ...extra },
  },
});

const checkRuns = (runs: any[]) =>
  nock("https://api.github.com")
    .get(`/repos/Codertocat/Hello-World/commits/${sha}/check-runs`)
    .query(true)
    .reply(200, { total_count: runs.length, check_runs: runs });

const createCheckRun = (expected: object) =>
  nock("https://api.github.com")
    .post("/repos/Codertocat/Hello-World/check-runs", (body: object) => {
      expect(body).toMatchObject(expected);
      return true;
    })
    .reply(201, { id: 5 });

const updateCheckRun = (expected: object, status = 200) =>
  nock("https://api.github.com")
    .patch("/repos/Codertocat/Hello-World/check-runs/5", (body: object) => {
      expect(body).toMatchObject(expected);
      return true;
    })
    .reply(status, {});

describe("check-run", () => {
  afterEach(() => {
    factory.cleanAll();
  });

  beforeEach(() => {
    factory.token();
  });

  test("maps deployment states", () => {
    expect(checkState("pending")).toEqual({ status: "queued" });
    expect(checkState("in_progress")).toEqual({ status: "in_progress" });
    expect(checkState("success")).toEqual({
      status: "completed",
      conclusion: "success",
    });
    expect(checkState("error")).toEqual({
      status: "completed",
      conclusion: "failure",
    });
    expect(checkState("inactive")).toBeUndefined();
  });

  test("creates a queued check run for a new deployment", async () => {
    configWith(true);
    checkRuns([]);
    const create = createCheckRun({
      name: "Deploy: production",
      head_sha: sha,
      external_id: "123",
      status: "queued",
    });

    await probot.receive(deploymentCreated());
    expect(create.isDone()).toBe(true);
  });

  test("completes the check run when the deployment succeeds", async () => {
    configWith(true);
    checkRuns([{ id: 5, external_id: "123", status: "queued" }]);
    const update = updateCheckRun({
      status: "completed",
      conclusion: "success",
      details_url: "https://ci.example.com/logs/1",
      output: { title: "Deployed to production" },
    });

    await probot.receive(
      deploymentStatus("success", {
        log_url: "https://ci.example.com/logs/1",
      }),
    );
    expect(update.isDone()).toBe(true);
  });

  test("ignores check runs of other deployments", async () => {
    configWith(true);
    checkRuns([{ id: 6, external_id: "122", status: "completed" }]);
    const create = createCheckRun({
      status: "completed",
      conclusion: "failure",
    });

    await probot.receive(deploymentStatus("failure"));
    expect(create.isDone()).toBe(true);
  });

  test("does not reopen a finished check run", async () => {
    configWith(true);
    checkRuns([{ id: 5, external_id: "123", status: "completed" }]);
    const update = updateCheckRun({});

    await probot.receive(deploymentStatus("in_progress"));
    expect(update.isDone()).toBe(false);
  });

  test("does nothing when the target did not opt in", async () => {
    configWith(false);
    const list = checkRuns([]);

    await probot.receive(deploymentCreated());
    await probot.receive(deploymentStatus("success"));
    expect(list.isDone()).toBe(false);
  });

  test("does nothing for deployments without a target", async () => {
    configWith(true);
    const list = checkRuns([]);

    await probot.receive(deploymentCreated({}));
    expect(list.isDone()).toBe(false);
  });

  test("does not fail without the Checks write permission", async () => {
    configWith(true);
    checkRuns([{ id: 5, external_id: "123", status: "in_progress" }]);
    const update = updateCheckRun({}, 403);

    await probot.receive(deploymentStatus("success"));
    expect(update.isDone()).toBe(true);
  });
});
