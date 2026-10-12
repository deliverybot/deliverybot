import { Response, NextFunction } from "express";
import { Dependencies } from "@deliverybot/core";
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

const PER_PAGE = 50;
const RECENT = 20;

/** The page number from `?after=` or `?before=`, as the pagination partial links. */
function pageParam(query: any): number {
  const n = Number(query.after || query.before || 1);
  return Number.isSafeInteger(n) && n > 0 ? n : 1;
}

function ago(iso: string) {
  return timeAgoInWords(Date.parse(iso));
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

  async function index(req: AuthedRequest, res: Response) {
    const [installs, users] = await Promise.all([
      store.list(),
      userService().list(),
    ]);
    const installations = installs.map((i) => ({
      ...i,
      repoCount: i.repositoryCount === null ? "?" : i.repositoryCount,
      installed: ago(i.createdAt),
    }));
    res.render("admin", {
      title: "Admin",
      csrf: req.csrfToken(),
      user: user(req),
      installations,
      hasInstallations: installations.length > 0,
      totalRepos: installs.reduce(
        (sum, i) => sum + (i.repositoryCount || 0),
        0,
      ),
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
    const page = pageParam(req.query);

    const activity = await store.listActivity(id);
    const byId = new Map(activity.map((a) => [a.id, a]));
    const row = (r: { fullName: string; private?: boolean }, a?: any) => ({
      fullName: r.fullName,
      private: !!r.private,
      lastEvent: a?.lastEvent,
      lastEventAgo: a ? ago(a.lastEventAt) : null,
    });

    // One page of repositories from GitHub; installations can have
    // thousands.
    let repos: ReturnType<typeof row>[] = [];
    let total = 0;
    let reposError = install.suspended;
    if (!install.suspended) {
      try {
        const octokit = await robot.auth(id);
        const { data } =
          await octokit.rest.apps.listReposAccessibleToInstallation({
            per_page: PER_PAGE,
            page,
          });
        total = data.total_count;
        repos = data.repositories.map((r) =>
          row({ fullName: r.full_name, private: r.private }, byId.get(r.id)),
        );
      } catch (error) {
        req.log.warn({ error, installation: id }, "admin: repo list failed");
        reposError = true;
      }
    }

    const recent = activity
      .slice(0, RECENT)
      .map((a) => row({ fullName: a.fullName }, a));

    res.render("admin-installation", {
      title: `Admin: ${install.account}`,
      csrf: req.csrfToken(),
      user: user(req),
      install,
      recent,
      hasRecent: recent.length > 0,
      repos,
      hasRepos: repos.length > 0,
      total,
      reposError,
      url: { path: req.path },
      pagination: {
        prev: page > 1 ? page - 1 : null,
        next: page * PER_PAGE < total ? page + 1 : null,
      },
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
