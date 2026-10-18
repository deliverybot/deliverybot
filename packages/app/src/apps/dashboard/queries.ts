import { User } from "../auth.js";
import { gql } from "../deploy/queries.js";
import get from "lodash.get";
import { newDeployFileUrl, timeAgoInWords } from "../util.js";

class NotFoundError extends Error {
  status = 404;
}

const reposPerPage = 50;

/**
 * One page of the installation's unarchived repositories the user can see:
 * those in `configured`, the ids of repositories with a deploy config, or
 * with `setup`, the others. Pages are counted after filtering, so this lists
 * every repository and pages the result itself.
 */
export async function repos(
  user: User,
  install: { id: number },
  configured: number[],
  page = 1,
  setup = false,
) {
  const all = await user.github.paginate(
    user.github.rest.apps.listInstallationReposForAuthenticatedUser,
    { per_page: 100, installation_id: install.id },
  );
  const active = all.filter((repo) => !repo.archived);
  const ids = new Set(configured);
  const matching = active.filter((repo) => ids.has(repo.id) !== setup);
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
