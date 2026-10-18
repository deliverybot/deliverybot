import { ConfiguredRepository } from "@deliverybot/core";
import { User } from "../auth.js";
import get from "lodash.get";
import { newDeployFileUrl, timeAgoInWords } from "../util.js";

class NotFoundError extends Error {
  status = 404;
}

const reposPerPage = 50;

const ReposQuery = `
query ($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Repository {
      name
      owner { login }
      description
      isArchived
      deployments(last: 1) {
        totalCount
        nodes {
          creator { login }
          createdAt
          latestStatus { state createdAt }
        }
      }
    }
  }
}`;

/**
 * One page of `configured`, the installation's repositories with a deploy
 * config, looked up by node id with the user's token. A repository the user
 * can't see, or that's archived, is left out, so a page can come up short.
 */
export async function configuredRepos(
  user: User,
  install: { id: number },
  configured: ConfiguredRepository[],
  page = 1,
) {
  const shown = configured.slice(
    (page - 1) * reposPerPage,
    page * reposPerPage,
  );
  let nodes: any[] = [];
  if (shown.length) {
    // Not using `gql`, which throws on the NOT_FOUND errors GitHub returns
    // next to the null of each repository the user can't see.
    const resp = await user.github.request("POST /graphql", {
      query: ReposQuery,
      variables: { ids: shown.map((r) => r.nodeId) },
    });
    nodes = get(resp.data, "data.nodes", []);
  }
  const repos = nodes
    .filter((node) => node && !node.isArchived)
    .map((node) => ({
      owner: node.owner.login,
      repo: node.name,
      description: node.description,
      stats: deployStats(node),
      install: { id: install.id, owner: node.owner.login },
    }));
  return { repos, hasNext: page * reposPerPage < configured.length };
}

/**
 * One page of the installation's unarchived repositories the user can see
 * that have no deploy config. Finding those takes every repository, so this
 * lists them all and pages the result itself.
 */
export async function unconfiguredRepos(
  user: User,
  install: { id: number },
  configured: ConfiguredRepository[],
  page = 1,
) {
  const all = await user.github.paginate(
    user.github.rest.apps.listInstallationReposForAuthenticatedUser,
    { per_page: 100, installation_id: install.id },
  );
  const ids = new Set(configured.map((r) => r.id));
  const matching = all.filter((repo) => !repo.archived && !ids.has(repo.id));
  const shown = matching.slice((page - 1) * reposPerPage, page * reposPerPage);
  const repos = shown.map((repo) => ({
    owner: repo.owner.login,
    repo: repo.name,
    description: repo.description,
    setupUrl: newDeployFileUrl(
      repo.owner.login,
      repo.name,
      repo.default_branch || "main",
    ),
    install: { id: install.id, owner: repo.owner.login },
  }));
  return { repos, hasNext: page * reposPerPage < matching.length };
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

function deployStats(repo: any) {
  const latest = get(repo, "deployments.nodes[0]");
  const state = get(latest, "latestStatus.state", "waiting");
  const creator = get(latest, "creator.login", "deliverybot");
  const createdAt = get(latest, "createdAt", null);

  return {
    lastDeploy: latest && {
      createdAt: createdAt ? timeAgoInWords(Date.parse(createdAt)) : "",
      creator,
      state: state.toLowerCase(),
    },
    totalDeployments: get(repo, "deployments.totalCount"),
  };
}
