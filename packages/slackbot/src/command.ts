import { Octokit } from "@deliverybot/core";
import { deploy, EnvLockStore } from "@deliverybot/deploybot";
import { SlackUser } from "./store.js";

interface Context {
  lock: EnvLockStore;
  text: string;
  log: any;
  response: string;
  team: {
    id: string;
  };
  loginUrl: string;
  user: SlackUser;
}

const help = `Deliverybot Slack app:

\`/deliverybot help\`: Print this help message.

\`/deliverybot login\`: Login to GitHub.

\`/deliverybot deploy [owner]/[repo]@[ref] [target]\`: Deploy a branch, tag or commit of a repository to [target].
`;

const handlers: {
  [k: string]: (ctx: Context) => void;
} = {
  deploy: (ctx: Context): any => {
    const spl = ctx.text.split(" ");
    const rawRef = spl[1];
    const target = spl[2];
    const ref = parseRef(rawRef);
    if (!target || !ref) {
      return {
        text: "Invalid command: Format must be [owner]/[repo]@[ref] [target]",
      };
    }

    doDeploy(ctx, target, ref)
      .then(() =>
        respond(ctx, {
          response_type: "in_channel",
          mrkdwn_in: ["text"],
          text: `Deploy \`${rawRef}\` to \`${target}\` queued`,
        }),
      )
      .catch((err) =>
        respond(ctx, {
          response_type: "in_channel",
          mrkdwn_in: ["text"],
          text: `Deploy \`${rawRef}\` to \`${target}\` failed \`${err.message}\``,
        }),
      );

    return {
      response_type: "in_channel",
      mrkdwn_in: ["text"],
      text: `Deploying \`${rawRef}\` to \`${target}\`...`,
    };
  },
  login: (ctx: Context): any => {
    return associate(
      ctx,
      "Connect your GitHub account by clicking the link below.",
    );
  },
  default: (ctx: Context): any => {
    return {
      mrkdwn_in: ["text"],
      text: help,
    };
  },
};

export function handle(ctx: Context): any {
  const cmd = ctx.text.split(" ")[0];
  const handler = handlers[cmd] ? handlers[cmd] : handlers.default;
  return handler(ctx);
}

export function associateError(ctx: { loginUrl: string }) {
  return associate(
    ctx,
    "Action failed: Please connect your GitHub account to continue.",
  );
}

function associate(ctx: { loginUrl: string }, text: string) {
  return {
    text,
    attachments: [
      {
        fallback: ctx.loginUrl,
        actions: [
          {
            type: "button",
            text: "Authenticate",
            url: ctx.loginUrl,
          },
        ],
      },
    ],
  };
}

const re = /([^\/]+)\/([^@]+)\@(\S+)/;

export function parseRef(r: string | undefined) {
  if (!r) {
    return;
  }
  const matches = re.exec(r);
  if (!matches || matches.length !== 4) {
    return;
  }
  return {
    owner: matches[1],
    repo: matches[2],
    ref: matches[3],
  };
}

async function doDeploy(
  ctx: Context,
  target: string,
  ref: { owner: string; repo: string; ref: string },
) {
  const github = new Octokit({ auth: ctx.user.github.token });
  // Accepts a branch, tag or sha, with or without a refs/, heads/ or tags/
  // prefix.
  const name = ref.ref.replace(/^refs\//, "").replace(/^(heads|tags)\//, "");
  let sha: string;
  try {
    const commit = await github.rest.repos.getCommit({
      owner: ref.owner,
      repo: ref.repo,
      ref: name,
    });
    sha = commit.data.sha;
  } catch (err) {
    throw new Error(`Ref not found ${ref.ref}`);
  }

  await deploy(github, ctx.log, ctx.lock, {
    ...ref,
    ref: name,
    target,
    sha,
    pr: undefined,
  });
}

function respond(ctx: Context, message: any) {
  return fetch(ctx.response, {
    method: "POST",
    body: JSON.stringify(message),
    headers: { "content-type": "application/json" },
  });
}
