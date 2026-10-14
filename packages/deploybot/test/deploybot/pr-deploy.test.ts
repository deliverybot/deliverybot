import * as factory from "../factory.js";
import { app } from "../app.js";
import {
  dashboardUrl,
  errorMessage,
  parseDeployCommand,
} from "../../src/pr-deploy.js";
import { LockError } from "../../src/types.js";
import { listChecks } from "../../src/util.js";

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

describe("dashboardUrl", () => {
  const repository = { full_name: "o/r" };

  test("links to the repository page", () => {
    expect(dashboardUrl("https://app.example/", repository)).toBe(
      "https://app.example/o/r",
    );
  });

  test("is undefined without a base URL", () => {
    expect(dashboardUrl("", repository)).toBeUndefined();
  });
});

describe("errorMessage", () => {
  test("names the dashboard without a link when there is none", () => {
    expect(errorMessage(new LockError("locked", "staging"), "main")).toBe(
      "`staging` is locked, so nothing was deployed. Unlock it on the Deliverybot dashboard and comment again.",
    );
  });
});

describe("listChecks", () => {
  test.each([
    [["a"], "`a`"],
    [["a", "b"], "`a` and `b`"],
    [["a", "b", "c"], "`a`, `b` and `c`"],
  ])("lists %j", (names, expected) => {
    expect(listChecks(names)).toBe(expected);
  });
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
    const ack = factory.reaction("+1");
    const deploy = factory.deploy();

    await probot.receive(factory.prDeployComment("review"));
    expect(deploy.isDone()).toBe(true);
    expect(ack.isDone()).toBe(true);
  });

  test("deploys when the comment ends in a newline", async () => {
    factory.config({ valid: true });
    factory.permission({ admin: true });
    const deploy = factory.deploy();

    await probot.receive(comment("/deploy review\n"));
    expect(deploy.isDone()).toBe(true);
  });

  test("still deploys when the reaction fails", async () => {
    factory.config({ valid: true });
    factory.permission({ admin: true });
    const deploy = factory.deploy();

    // No reaction mock, so the reaction request errors.
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

    const expected =
      "@Codertocat There is no `invalid` target in [`.github/deploy.yml`](https://deliverybot.dev/docs/configuration/) on `refs/heads/changes`.\n\n" +
      "Available targets: `review`, `canary`, `production`, `performance`.";
    const error = factory.errorComment(expected);
    await probot.receive(factory.prDeployComment("invalid"));
    expect(deploy.isDone()).toBe(false);
    expect(error.isDone()).toBe(true);
  });

  test("names the locked environment", async () => {
    factory.config({ valid: true });
    factory.permission({ admin: true });
    const deploy = factory.deploy();
    const unlock = await factory.lockedEnvironment("pr1");

    try {
      const error = factory.errorComment(
        "@Codertocat `pr1` is locked, so nothing was deployed. Unlock it on the [Deliverybot dashboard](https://deliverybot.test/Codertocat/Hello-World) and comment again.",
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
      "@Codertocat [`.github/deploy.yml`](https://deliverybot.dev/docs/configuration/) on `refs/heads/changes` is invalid: config.fake is not of a type(s) object";
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
      "@Codertocat [`.github/deploy.yml`](https://deliverybot.dev/docs/configuration/) wasn't found on `refs/heads/changes`.",
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

describe("pr-deploy queueing", () => {
  const pending = [
    { context: "continuous-integration/travis-ci/push", state: "pending" },
  ];
  const failed = [
    { context: "continuous-integration/travis-ci/push", state: "failure" },
  ];

  afterEach(() => {
    factory.cleanAll();
  });

  beforeEach(() => {
    factory.token();
    factory.repo().persist();
    factory.gitCommit().persist();
    factory.pr().persist();
    factory.config({ valid: true });
    factory.permission({ admin: true });
    factory.reaction("+1");
  });

  // Queues the deploy: the command and the immediate re-check both find the
  // check still pending.
  async function queueDeploy() {
    factory.gitRef();
    factory.noDeployments();
    const refused = factory
      .deployChecksUnmet(pending)
      .post("/repos/Codertocat/Hello-World/deployments")
      .reply(409, {
        errors: [{ field: "required_contexts", contexts: pending }],
      });
    const queued = factory.errorComment(
      "@Codertocat Waiting for `continuous-integration/travis-ci/push` to pass, then I'll deploy to `review`.",
    );
    await probot.receive(factory.prDeployComment("review"));
    expect(refused.isDone()).toBe(true);
    expect(queued.isDone()).toBe(true);
  }

  test("deploys once pending checks pass", async () => {
    await queueDeploy();

    factory.gitRef();
    factory.noDeployments();
    const deploy = factory.deploy();
    await probot.receive(factory.checkRun());
    expect(deploy.isDone()).toBe(true);

    // The watch is gone, so later checks don't deploy again.
    const again = factory.deploy();
    await probot.receive(factory.checkRun());
    expect(again.isDone()).toBe(false);
  });

  test("keeps waiting while checks are pending", async () => {
    await queueDeploy();

    factory.gitRef();
    factory.noDeployments();
    factory.deployChecksUnmet(pending);
    await probot.receive(factory.status());

    factory.gitRef();
    factory.noDeployments();
    const deploy = factory.deploy();
    await probot.receive(factory.checkRun());
    expect(deploy.isDone()).toBe(true);
  });

  test("cancels when a required check fails", async () => {
    await queueDeploy();

    factory.gitRef();
    factory.noDeployments();
    factory.deployChecksUnmet(failed);
    const cancelled = factory.errorComment(
      "@Codertocat `continuous-integration/travis-ci/push` failed, so the queued deploy to `review` was cancelled.",
    );
    await probot.receive(factory.checkRun());
    expect(cancelled.isDone()).toBe(true);

    const deploy = factory.deploy();
    await probot.receive(factory.checkRun());
    expect(deploy.isDone()).toBe(false);
  });

  test("cancels when the branch moves on", async () => {
    await queueDeploy();

    factory.movedRef();
    const cancelled = factory.errorComment(
      "@Codertocat `changes` moved on to a newer commit, so the queued deploy to `review` was cancelled.",
    );
    await probot.receive(factory.checkRun());
    expect(cancelled.isDone()).toBe(true);
  });

  test("cancels when the branch is deleted", async () => {
    await queueDeploy();

    factory.goneRef();
    const cancelled = factory.errorComment(
      "@Codertocat `changes` no longer exists, so the queued deploy to `review` was cancelled.",
    );
    await probot.receive(factory.checkRun());
    expect(cancelled.isDone()).toBe(true);
  });

  test("drops the queued deploy when the pull request closes", async () => {
    await queueDeploy();

    factory.withDeployments([]);
    await probot.receive(factory.prClosed());

    factory.gitRef();
    factory.noDeployments();
    const deploy = factory.deploy();
    await probot.receive(factory.checkRun());
    expect(deploy.isDone()).toBe(false);
  });

  test("tells when the environment got locked", async () => {
    await queueDeploy();

    const unlock = await factory.lockedEnvironment("pr1");
    try {
      factory.gitRef();
      factory.noDeployments();
      const deploy = factory.deploy();
      const locked = factory.errorComment(
        "@Codertocat `pr1` is locked, so nothing was deployed. Unlock it on the [Deliverybot dashboard](https://deliverybot.test/Codertocat/Hello-World) and comment again.",
      );
      await probot.receive(factory.checkRun());
      expect(deploy.isDone()).toBe(false);
      expect(locked.isDone()).toBe(true);
    } finally {
      await unlock();
    }
  });

  test("doesn't queue when a required check already failed", async () => {
    const refused = factory.deployChecksUnmet(failed);
    const reply = factory.errorComment(
      expect.stringMatching(/^@Codertocat GitHub refused the deployment/),
    );
    await probot.receive(factory.prDeployComment("review"));
    expect(refused.isDone()).toBe(true);
    expect(reply.isDone()).toBe(true);

    const deploy = factory.deploy();
    await probot.receive(factory.checkRun());
    expect(deploy.isDone()).toBe(false);
  });

  describe("after an auto merge", () => {
    const mergeSha = "1111111111111111111111111111111111111111";
    const merged =
      "@Codertocat `changes` was behind, so GitHub merged the default branch into it first. I'll deploy the merge commit to `review` once its checks pass.";
    const mergeCheckRun = () => {
      const event = factory.checkRun();
      return {
        ...event,
        payload: {
          ...event.payload,
          check_run: {
            ...event.payload.check_run,
            head_sha: mergeSha,
            check_suite: {
              ...event.payload.check_run.check_suite,
              head_sha: mergeSha,
            },
          },
        },
      };
    };

    // The immediate re-check of the merge commit finds its checks pending.
    function mergeCommitPending() {
      factory.movedRef();
      factory.noDeployments();
      return factory.deployChecksUnmet(pending);
    }

    async function deploysMergeCommit() {
      factory.movedRef();
      factory.noDeployments();
      const deploy = factory.deploy();
      await probot.receive(mergeCheckRun());
      expect(deploy.isDone()).toBe(true);
    }

    test("queues the merge commit when /deploy merges", async () => {
      const merge = factory.mergedDeploy();
      factory.movedRef();
      const reply = factory.errorComment(merged);
      const recheck = mergeCommitPending();
      await probot.receive(factory.prDeployComment("review"));
      expect(merge.isDone()).toBe(true);
      expect(reply.isDone()).toBe(true);
      expect(recheck.isDone()).toBe(true);

      await deploysMergeCommit();
    });

    test("follows a queued deploy onto the merge commit", async () => {
      await queueDeploy();

      factory.gitRef();
      factory.noDeployments();
      const merge = factory.mergedDeploy();
      factory.movedRef();
      const reply = factory.errorComment(merged);
      const recheck = mergeCommitPending();
      await probot.receive(factory.checkRun());
      expect(merge.isDone()).toBe(true);
      expect(reply.isDone()).toBe(true);
      expect(recheck.isDone()).toBe(true);

      await deploysMergeCommit();
    });

    test("tells a queued deploy about a merge conflict", async () => {
      await queueDeploy();

      factory.gitRef();
      factory.noDeployments();
      factory.conflictDeploy("Conflict merging master into changes.");
      const reply = factory.errorComment(
        "@Codertocat Could not merge master into changes: resolve the conflicts and deploy again.",
      );
      await probot.receive(factory.checkRun());
      expect(reply.isDone()).toBe(true);
    });
  });
});
