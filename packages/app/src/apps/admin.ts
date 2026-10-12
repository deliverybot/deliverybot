import { Response, NextFunction } from "express";
import {
  Dependencies,
  Application,
  InstallationRecord,
} from "@deliverybot/core";
import { AuthedRequest, authenticate } from "./auth.js";
import { timeAgoInWords } from "./util.js";

class NotFoundError extends Error {
  status = 404;
}

/** Parses a comma or whitespace separated list of GitHub logins. */
export function parseLogins(value: string | undefined): Set<string> {
  return new Set(
    (value || "")
      .split(/[\s,]+/)
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean),
  );
}

function ago(iso: string) {
  return timeAgoInWords(Date.parse(iso));
}

/** Repositories the app can access on an installation, or null if unknown. */
async function repoCount(robot: Application, i: InstallationRecord) {
  if (i.suspended) return null;
  try {
    const octokit = await robot.auth(i.id);
    const { data } = await octokit.rest.apps.listReposAccessibleToInstallation({
      per_page: 1,
    });
    return data.total_count;
  } catch (error) {
    robot.log.warn({ error, installation: i.id }, "admin: repo count failed");
    return null;
  }
}

/**
 * Admin dashboard listing who uses this deployment of Deliverybot. Only the
 * GitHub logins in the `adminLogins` config (ADMIN_GITHUB_LOGINS) can open
 * it; everyone else gets a 404.
 */
export function admin({
  app,
  csrf,
  robot,
  config,
  installationService,
  userService,
}: Dependencies) {
  const admins = parseLogins(config.adminLogins);
  const store = installationService();

  function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
    if (!res.locals.isAdmin) {
      next(new NotFoundError("Not found"));
      return;
    }
    next();
  }

  // Lets the header show admins a link here.
  app.use((req: AuthedRequest, res: Response, next: NextFunction) => {
    const login = (req.session?.login || "").toLowerCase();
    res.locals.isAdmin = !!login && admins.has(login);
    next();
  });

  function user(req: AuthedRequest) {
    const u = req.user!;
    return { user: u.id, login: u.username, avatar: u.avatar };
  }

  // Installations made before they were tracked, or whose webhooks were
  // missed, are only known to GitHub. Copy them in before listing, and
  // return when GitHub says each was installed.
  async function syncInstallations(req: AuthedRequest) {
    const installedAt = new Map<number, string>();
    try {
      const octokit = await robot.auth();
      const list = await octokit.paginate(octokit.rest.apps.listInstallations, {
        per_page: 100,
      });
      for (const i of list) {
        const account =
          i.account && "login" in i.account ? i.account : undefined;
        if (!account) continue;
        installedAt.set(i.id, i.created_at);
        await store.upsert({
          id: i.id,
          account: account.login,
          accountType: account.type,
          repositorySelection: i.repository_selection,
          suspended: !!i.suspended_at,
        });
      }
    } catch (error) {
      req.log.warn({ error }, "admin: installation sync failed");
    }
    return installedAt;
  }

  async function index(req: AuthedRequest, res: Response) {
    const installedAt = await syncInstallations(req);
    const [installs, users] = await Promise.all([
      store.list(),
      userService().list(),
    ]);
    const counts = await Promise.all(installs.map((i) => repoCount(robot, i)));
    const installations = installs.map((i, n) => ({
      ...i,
      repoCount: counts[n] === null ? "?" : counts[n],
      installed: ago(installedAt.get(i.id) || i.createdAt),
    }));
    res.render("admin", {
      title: "Admin",
      csrf: req.csrfToken(),
      user: user(req),
      installations,
      hasInstallations: installations.length > 0,
      totalRepos: counts.reduce<number>((sum, c) => sum + (c || 0), 0),
      users: users.map((u) => ({
        username: u.username,
        firstSeen: ago(u.createdAt),
        lastSeen: ago(u.updatedAt),
      })),
      hasUsers: users.length > 0,
    });
  }

  async function installation(req: AuthedRequest, res: Response) {
    const id = Number(req.params.id);
    const install = Number.isSafeInteger(id) ? await store.get(id) : undefined;
    if (!install) throw new NotFoundError("Installation not found");

    const activity = await store.listActivity(id);
    const byId = new Map(activity.map((a) => [a.id, a]));
    let repos: { id: number; fullName: string; private: boolean }[] = [];
    let reposError = false;
    if (install.suspended) {
      reposError = true;
    } else {
      try {
        const octokit = await robot.auth(id);
        const list = await octokit.paginate(
          octokit.rest.apps.listReposAccessibleToInstallation,
          { per_page: 100 },
        );
        repos = list.map((r) => ({
          id: r.id,
          fullName: r.full_name,
          private: r.private,
        }));
      } catch (error) {
        req.log.warn({ error, installation: id }, "admin: repo list failed");
        reposError = true;
      }
    }

    // Repositories with recent activity first, then by name. Activity of a
    // repository the app no longer lists is kept so nothing silently hides.
    const seen = new Set(repos.map((r) => r.id));
    const rows = [
      ...repos.map((r) => ({ ...r, activity: byId.get(r.id) })),
      ...activity
        .filter((a) => !seen.has(a.id))
        .map((a) => ({
          id: a.id,
          fullName: a.fullName,
          private: false,
          activity: a,
        })),
    ]
      .sort(
        (a, b) =>
          (b.activity?.lastEventAt || "").localeCompare(
            a.activity?.lastEventAt || "",
          ) || a.fullName.localeCompare(b.fullName),
      )
      .map((r) => ({
        fullName: r.fullName,
        private: r.private,
        lastEvent: r.activity?.lastEvent,
        lastEventAgo: r.activity ? ago(r.activity.lastEventAt) : null,
      }));

    res.render("admin-installation", {
      title: `Admin: ${install.account}`,
      csrf: req.csrfToken(),
      user: user(req),
      install,
      repos: rows,
      hasRepos: rows.length > 0,
      reposError,
    });
  }

  app.get("/_/admin", csrf, authenticate, requireAdmin, index);
  app.get(
    "/_/admin/installations/:id",
    csrf,
    authenticate,
    requireAdmin,
    installation,
  );
}
