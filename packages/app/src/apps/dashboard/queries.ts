import { User } from "../auth.js";
import { gql } from "../deploy/queries.js";
import get from "lodash.get";
import { timeAgoInWords } from "../util.js";

class NotFoundError extends Error {
  status = 404;
}

const reposPerPage = 50;

/**
 * One page of an installation's repositories, leaving out archived ones.
 * `hasNext` comes from GitHub's total, since hiding archived repositories
 * can leave a page short while more follow.
 */
export async function repos(user: User, install: { id: number }, page = 1) {
  const resp =
    await user.github.rest.apps.listInstallationReposForAuthenticatedUser({
      page,
      per_page: reposPerPage,
      installation_id: install.id,
    });
  const active = resp.data.repositories.filter((repo) => !repo.archived);
  const stats = active.length ? await repoStats(user.token, active) : [];
  const result = active.map((repo, i) => ({
    owner: repo.owner.login,
    repo: repo.name,
    description: repo.description,
    stats: stats[i],
    install: {
      id: install.id,
      owner: repo.owner.login,
    },
  }));
  return {
    repos: result,
    hasNext: page * reposPerPage < resp.data.total_count,
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
