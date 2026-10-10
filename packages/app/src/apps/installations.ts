import { Dependencies, Context, KVStore } from "@deliverybot/core";

/**
 * Tracks GitHub App installations, which are Deliverybot's tenants, and
 * deletes a repository's stored data (environment locks and pending
 * auto-deploys) once the app loses access to it.
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
