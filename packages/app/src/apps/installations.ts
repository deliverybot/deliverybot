import {
  Application,
  Context,
  Dependencies,
  InstallationStore,
  KVStore,
} from "@deliverybot/core";

/** Repositories an installation's client can access. */
async function countRepositories(octokit: any): Promise<number> {
  const { data } = await octokit.rest.apps.listReposAccessibleToInstallation({
    per_page: 1,
  });
  return data.total_count;
}

const configPath = ".github/deploy.yml";

/** Whether a repository has a deploy config on its default branch. */
async function hasConfig(
  octokit: any,
  owner: string,
  repo: string,
): Promise<boolean> {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: configPath,
    });
    return !Array.isArray(data) && data.type === "file";
  } catch (error: any) {
    if (error.status === 404) return false;
    throw error;
  }
}

/**
 * Records which of an installation's repositories have a deploy config,
 * logging a repository it can't check instead of failing the rest.
 */
async function recordConfigs(
  octokit: any,
  store: InstallationStore,
  installationId: number,
  repos: { id: number; full_name: string }[],
  log: { warn: (obj: any, msg: string) => void },
) {
  for (const r of repos) {
    try {
      const [owner, repo] = r.full_name.split("/");
      const configured = await hasConfig(octokit, owner, repo);
      await store.setConfigured(r.id, installationId, configured);
    } catch (error) {
      log.warn({ error, repo: r.full_name }, "config check failed");
    }
  }
}

/**
 * Copies every installation GitHub lists for the app into the store, with
 * its repository count and which repositories have a deploy config, for
 * installations made before they were tracked or whose webhooks were
 * missed. Returns how many it saved.
 */
export async function syncInstallations(
  robot: Application,
  store: InstallationStore,
) {
  const octokit = await robot.auth();
  const list = await octokit.paginate(octokit.rest.apps.listInstallations, {
    per_page: 100,
  });
  let saved = 0;
  for (const i of list) {
    // Enterprise installations have no login.
    if (!i.account || !("login" in i.account)) continue;
    await store.upsert({
      id: i.id,
      account: i.account.login,
      accountType: i.account.type,
      repositorySelection: i.repository_selection,
      suspended: !!i.suspended_at,
    });
    if (!i.suspended_at) {
      try {
        const octokit = await robot.auth(i.id);
        const repos = await octokit.paginate(
          octokit.rest.apps.listReposAccessibleToInstallation,
          { per_page: 100 },
        );
        await store.setRepositoryCount(i.id, repos.length);
        await recordConfigs(octokit, store, i.id, repos, robot.log);
      } catch (error) {
        robot.log.warn({ error, installation: i.id }, "repo sync failed");
      }
    }
    saved++;
  }
  return saved;
}

/**
 * Tracks GitHub App installations, which are Deliverybot's tenants, and the
 * last event of each of their repositories, and which repositories have a
 * deploy config on their default branch. Deletes a repository's stored
 * data (environment locks, pending auto-deploys and activity) once the app
 * loses access to it.
 */
export function installations({
  robot,
  installationService,
  kvService,
}: Dependencies) {
  const store = installationService();
  const kv: KVStore<unknown> = kvService();

  async function save(context: Context, suspended: boolean) {
    const i = context.payload.installation;
    await store.upsert({
      id: i.id,
      account: i.account.login,
      accountType: i.account.type,
      repositorySelection: i.repository_selection,
      suspended,
    });
    context.log.info(
      { installation: i.id, account: i.account.login, suspended },
      "installation saved",
    );
  }

  async function refreshCount(context: Context) {
    const id = context.payload.installation.id;
    try {
      await store.setRepositoryCount(
        id,
        await countRepositories(context.octokit),
      );
    } catch (error) {
      context.log.warn({ error, installation: id }, "repo count failed");
    }
  }

  async function forget(context: Context, repos: { id: number }[]) {
    await store.forgetRepositories(repos.map((r) => r.id));
    for (const repo of repos) {
      await kv.delPrefix(`repos/${repo.id}/`);
      await kv.delPrefix(`queue/${repo.id}-`);
    }
    if (repos.length) {
      context.log.info(
        { repos: repos.map((r) => r.id) },
        "deleted data for removed repositories",
      );
    }
  }

  robot.onAny(async (context) => {
    const { installation, repository, action } = context.payload as any;
    if (!installation || !repository) return;
    await store.recordActivity({
      id: repository.id,
      installationId: installation.id,
      fullName: repository.full_name,
      lastEvent: action ? `${context.name}.${action}` : context.name,
    });
  });

  robot.on(
    [
      "installation.created",
      "installation.new_permissions_accepted",
      "installation.unsuspend",
    ],
    async (context) => {
      await save(context, false);
      await refreshCount(context);
    },
  );

  robot.on("installation.created", (context) =>
    recordConfigs(
      context.octokit,
      store,
      context.payload.installation.id,
      context.payload.repositories || [],
      context.log,
    ),
  );

  robot.on("installation_repositories.added", (context) =>
    recordConfigs(
      context.octokit,
      store,
      context.payload.installation.id,
      context.payload.repositories_added,
      context.log,
    ),
  );

  // A push lists at most 20 commits, so a longer one is checked regardless.
  robot.on("push", async (context) => {
    const { ref, commits, repository, installation } = context.payload as any;
    if (!installation || ref !== `refs/heads/${repository.default_branch}`) {
      return;
    }
    const touched =
      commits.length >= 20 ||
      commits.some((c: any) =>
        [...c.added, ...c.modified, ...c.removed].includes(configPath),
      );
    if (!touched) return;
    await recordConfigs(
      context.octokit,
      store,
      installation.id,
      [repository],
      context.log,
    );
  });

  robot.on("installation.suspend", (context) => save(context, true));

  robot.on("installation.deleted", async (context) => {
    await store.delete(context.payload.installation.id);
    await forget(context, context.payload.repositories || []);
    context.log.info(
      { installation: context.payload.installation.id },
      "installation deleted",
    );
  });

  robot.on("installation_repositories.removed", (context) =>
    forget(context, context.payload.repositories_removed),
  );

  robot.on(
    ["installation_repositories.added", "installation_repositories.removed"],
    refreshCount,
  );
}
