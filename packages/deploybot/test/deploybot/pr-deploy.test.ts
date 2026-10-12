import * as factory from "../factory.js";
import { app } from "../app.js";
import { parseDeployCommand } from "../../src/pr-deploy.js";

const probot = app.probot;

const comment = (body: string, overrides: any = {}): any => {
  const event = factory.prDeployComment("review");
  return {
    ...event,
    payload: {
      ...event.payload,
      ...overrides,
      comment: { ...event.payload.comment, body },
    },
  };
};

describe("parseDeployCommand", () => {
  test.each([
    ["/deploy staging", "staging"],
    ["/deploy staging\n", "staging"],
    ["  /deploy   staging  ", "staging"],
    ["/deploy staging\r\nShipping the fix", "staging"],
    ["/deploy", undefined],
    ["/deploy\n", undefined],
  ])("parses %j", (body, target) => {
    expect(parseDeployCommand(body)).toEqual({ target });
  });

  test.each(["/deployed it", "please /deploy staging", "deploy staging"])(
    "ignores %j",
    (body) => {
      expect(parseDeployCommand(body)).toBeUndefined();
    },
  );
});

describe("pr-deploy", () => {
  afterEach(() => {
    factory.cleanAll();
  });

  beforeEach(() => {
    factory.token();
    factory.gitCommit();
    factory.repo();
    factory.deploymentStatus();
    factory.pr();
  });

  test("creates a deployment", async () => {
    factory.config({ valid: true });
    factory.permission({ admin: true });
    const eyes = factory.reaction("eyes", 100);
    const rocket = factory.reaction("rocket", 101);
    const deploy = factory.deploy();

    await probot.receive(factory.prDeployComment("review"));
    expect(deploy.isDone()).toBe(true);
    expect(eyes.isDone()).toBe(true);
    expect(rocket.isDone()).toBe(true);
  });

  test("deploys when the comment ends in a newline", async () => {
    factory.config({ valid: true });
    factory.permission({ admin: true });
    const deploy = factory.deploy();

    await probot.receive(comment("/deploy review\n"));
    expect(deploy.isDone()).toBe(true);
  });

  test("still deploys when reactions fail", async () => {
    factory.config({ valid: true });
    factory.permission({ admin: true });
    const deploy = factory.deploy();

    // No reaction mocks, so every reaction request errors.
    await probot.receive(factory.prDeployComment("review"));
    expect(deploy.isDone()).toBe(true);
  });

  test("drops comments that aren't deploy commands", async () => {
    const seen: string[] = [];
    probot.onAny(async (context) => {
      if (context.name === "issue_comment")
        seen.push(context.payload.comment.body);
    });
    await probot.receive(comment("looks good"));
    await probot.receive(comment("/deployed this yesterday"));
    expect(seen).toEqual([]);
  });

  test("drops deploy commands on plain issues", async () => {
    const seen: string[] = [];
    probot.onAny(async (context) => {
      if (context.name === "issue_comment")
        seen.push(context.payload.comment.body);
    });
    await probot.receive(comment("/deploy review", { issue: { number: 1 } }));
    expect(seen).toEqual([]);
  });

  test("creates a deployment production", async () => {
    factory.config({ valid: true });
    factory.permission({ admin: true });
    const deploy = factory.deploy();

    await probot.receive(factory.prDeployComment("production"));
    expect(deploy.isDone()).toBe(true);
  });

  test("lists targets when none is given", async () => {
    factory.config({ valid: true });
    factory.permission({ admin: true });
    const deploy = factory.deploy();

    const reply = factory.errorComment(
      "@Codertocat Tell me where to deploy, for example `/deploy review`.\n\n" +
        "Available targets: `review`, `canary`, `production`, `performance`.",
    );
    await probot.receive(comment("/deploy"));
    expect(deploy.isDone()).toBe(false);
    expect(reply.isDone()).toBe(true);
  });

  test("lists targets if invalid target", async () => {
    factory.config({ valid: true });
    factory.permission({ admin: true });
    const deploy = factory.deploy();
    const confused = factory.reaction("confused", 101);

    const expected =
      "@Codertocat There is no `invalid` target in `.github/deploy.yml` on `refs/heads/changes`.\n\n" +
      "Available targets: `review`, `canary`, `production`, `performance`.";
    const error = factory.errorComment(expected);
    await probot.receive(factory.prDeployComment("invalid"));
    expect(deploy.isDone()).toBe(false);
    expect(error.isDone()).toBe(true);
    expect(confused.isDone()).toBe(true);
  });

  test("names the locked environment", async () => {
    factory.config({ valid: true });
    factory.permission({ admin: true });
    const deploy = factory.deploy();
    const unlock = await factory.lockedEnvironment("pr1");

    try {
      const error = factory.errorComment(
        "@Codertocat `pr1` is locked, so nothing was deployed. Unlock it on the Deliverybot dashboard and comment again.",
      );
      await probot.receive(factory.prDeployComment("review"));
      expect(deploy.isDone()).toBe(false);
      expect(error.isDone()).toBe(true);
    } finally {
      await unlock();
    }
  });

  test("error comment on invalid file", async () => {
    factory.config({ valid: false });
    factory.permission({ admin: true });
    const deploy = factory.deploy();

    const expected =
      "@Codertocat `.github/deploy.yml` on `refs/heads/changes` is invalid: config.fake is not of a type(s) object";
    const error = factory.errorComment(expected);
    await probot.receive(factory.prDeployComment("review"));
    expect(deploy.isDone()).toBe(false);
    expect(error.isDone()).toBe(true);
  });

  test("error comment on missing file", async () => {
    factory.noConfig();
    factory.permission({ admin: true });
    const deploy = factory.deploy();

    const error = factory.errorComment(
      "@Codertocat `.github/deploy.yml` wasn't found on `refs/heads/changes`.",
    );
    await probot.receive(factory.prDeployComment("review"));
    expect(deploy.isDone()).toBe(false);
    expect(error.isDone()).toBe(true);
  });

  test("explains checks that haven't passed", async () => {
    factory.config({ valid: true });
    factory.permission({ admin: true });
    const deploy = factory.deployConflict();

    const error = factory.errorComment(
      expect.stringMatching(
        /^@Codertocat GitHub refused the deployment, usually because required checks haven't passed yet: /,
      ),
    );
    await probot.receive(factory.prDeployComment("review"));
    expect(deploy.isDone()).toBe(true);
    expect(error.isDone()).toBe(true);
  });

  test("error comment on api error", async () => {
    factory.config({ valid: true });
    factory.permission({ admin: true });
    const deploy = factory.errorDeploy();

    const expected = "@Codertocat Failed to trigger deployment: API error";
    const error = factory.errorComment(expected);
    await probot.receive(factory.prDeployComment("review"));
    expect(deploy.isDone()).toBe(true);
    expect(error.isDone()).toBe(true);
  });

  test("tells users without write access", async () => {
    factory.config({ valid: true });
    factory.permission({ admin: false });
    const deploy = factory.deploy();

    const reply = factory.errorComment(
      "@Codertocat You need write access to this repository to deploy.",
    );
    await probot.receive(factory.prDeployComment("review"));
    expect(deploy.isDone()).toBe(false);
    expect(reply.isDone()).toBe(true);
  });
});
