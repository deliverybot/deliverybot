import { User } from "../auth.js";
import { gql } from "../deploy/queries.js";
import get from "lodash.get";
import { newDeployFileUrl, timeAgoInWords } from "../util.js";

class NotFoundError extends Error {
  status = 404;
}

const reposPerPage = 50;
// Repositories checked for a deploy config per GraphQL request.
const configBatch = 100;

/**
 * One page of an installation's unarchived repositories: those with a
 * `.github/deploy.yml` on their default branch, or with `setup`, those
 * without one. Finding out takes every repository, so this lists them all
 * and pages the result itself.
 */
export async function repos(
  user: User,
  install: { id: number },
  page = 1,
  setup = false,
) {
  const all = await user.github.paginate(
    user.github.rest.apps.listInstallationReposForAuthenticatedUser,
    { per_page: 100, installation_id: install.id },
  );
  const active = all.filter((repo) => !repo.archived);
  const configured = await hasConfig(user.token, active);
  const matching = active.filter((_, i) => configured[i] !== setup);
  const shown = matching.slice((page - 1) * reposPerPage, page * reposPerPage);
  const stats =
    !setup && shown.length ? await repoStats(user.token, shown) : [];
  const result = shown.map((repo, i) => ({
    owner: repo.owner.login,
    repo: repo.name,
    description: repo.description,
    stats: stats[i],
    setupUrl: setup
      ? newDeployFileUrl(
          repo.owner.login,
          repo.name,
          repo.default_branch || "main",
        )
      : undefined,
    install: {
      id: install.id,
      owner: repo.owner.login,
    },
  }));
  return {
    repos: result,
    hasNext: page * reposPerPage < matching.length,
  };
}

/** Whether each repository has a deploy config on its default branch. */
async function hasConfig(
  token: string,
  repos: Array<{ owner: { login: string }; name: string }>,
) {
  const result: boolean[] = [];
  for (let start = 0; start < repos.length; start += configBatch) {
    const batch = repos.slice(start, start + configBatch);
    const query = `
query {
${batch
  .map(
    (r, i) => `
    r${i}: repository(owner: "${r.owner.login}", name: "${r.name}") {
      object(expression: "HEAD:.github/deploy.yml") { __typename }
    }`,
  )
  .join("\n")}
}`;
    const data = await gql(token, query, {});
    batch.forEach((_, i) => {
      result.push(get(data, `r${i}.object.__typename`) === "Blob");
    });
  }
  return result;
}

export async function install(user: User, name: string) {
  const installList = await installs(user);
  const install = installList.find((i) => i.name === name);
  if (!install) {
    throw new NotFoundError("Installation not found");
  }
  return install;
}

export async function installs(user: User) {
  const installations =
    await user.github.rest.apps.listInstallationsForAuthenticatedUser({});
  return installations.data.installations.map((install) => {
    // Enterprise installations have no login or type.
    const account =
      install.account && "login" in install.account ? install.account : null;
    return {
      id: install.id,
      name: account ? account.login : "",
      target_type: install.target_type,
      account: {
        type: account ? account.type : "",
        id: install.account ? install.account.id : undefined,
      },
      htmlUrl: install.html_url,
    };
  });
}

async function repoStats(
  token: string,
  repos: Array<{ owner: { login: string }; name: string }>,
) {
  const query = `
query {
${repos
  .map(
    (r, i) => `
    r${i}: repository(
      owner: "${r.owner.login}",
      name: "${r.name}",
    ) {
    deployments(last: 1) {
      totalCount
     	nodes {
        creator {
          login
        }
        createdAt
        latestStatus {
          state
          createdAt
        }
      }
    }
  }`,
  )
  .join("\n")}
}`;

  const data = await gql(token, query, {});
  return repos.map((_, i) => {
    const payload = data[`r${i}`];
    const latest = get(payload, "deployments.nodes[0]");
    const state = get(latest, "latestStatus.state", "waiting");
    const creator = get(latest, "creator.login", "deliverybot");
    const createdAt = get(latest, "createdAt", null);

    return {
      lastDeploy: latest && {
        createdAt: createdAt ? timeAgoInWords(Date.parse(createdAt)) : "",
        creator,
        state: state.toLowerCase(),
      },
      totalDeployments: get(payload, "deployments.totalCount"),
    };
  });
}
