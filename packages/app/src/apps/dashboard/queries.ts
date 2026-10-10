import { User } from "../auth";
import { gql } from "../deploy/queries";
import get = require("lodash.get");
import { timeAgoInWords } from "../util";

class NotFoundError extends Error {
  status = 404;
}

export async function repos(
  user: User,
  install: { id: number },
  page?: number,
) {
  const resp = await user.github.apps.listInstallationReposForAuthenticatedUser(
    {
      page,
      per_page: 50,
      installation_id: install.id,
    },
  );
  const stats = await repoStats(user.token, resp.data.repositories);
  const result = resp.data.repositories.map((repo, i) => ({
    owner: repo.owner.login,
    repo: repo.name,
    description: repo.description,
    stats: stats[i],
    install: {
      id: install.id,
      owner: repo.owner.login,
    },
  }));
  return result;
}

export async function install(user: User, name: string) {
  const installList = await installs(user);
  const install = installList.find(i => i.name === name);
  if (!install) {
    throw new NotFoundError("Installation not found");
  }
  return install;
}

export async function installs(user: User) {
  const installations = await user.github.apps.listInstallationsForAuthenticatedUser(
    {},
  );
  return installations.data.installations.map(install => {
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
