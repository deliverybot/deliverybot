import {
  Application,
  Context,
  Dependencies,
  InstallationStore,
  KVStore,
} from "@deliverybot/core";

/**
 * Copies every installation GitHub lists for the app into the store, for
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
    saved++;
  }
  return saved;
}

/**
 * Tracks GitHub App installations, which are Deliverybot's tenants, and the
 * last event of each of their repositories. Deletes a repository's stored
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
    (context) => save(context, false),
  );
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
}
