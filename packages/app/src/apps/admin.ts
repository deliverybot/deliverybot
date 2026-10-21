import { Response, NextFunction } from "express";
import {
  Dependencies,
  InstallationRecord,
  UserRecord,
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

const PER_PAGE = 50;
const RECENT = 20;
/** Installations with a webhook event this recent count as active. */
const ACTIVE_DAYS = 30;
/** Days in the deploys per day chart. */
const CHART_DAYS = 30;
const TOP_INSTALLATIONS = 10;
const RECENT_DEPLOYMENTS = 10;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const tabs = ["overview", "installations", "users"];

const stateColors: { [state: string]: string } = {
  success: "success",
  failure: "danger",
  error: "danger",
  pending: "attention",
  queued: "attention",
  in_progress: "attention",
};

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

  /** Deployment counts, activity and the busiest installations. */
  async function overview(installs: InstallationRecord[], users: UserRecord[]) {
    const now = Date.now();
    const since = (ms: number) => new Date(now - ms).toISOString();
    // The chart's days are whole UTC days, ending with today.
    const firstDay = new Date(now - (CHART_DAYS - 1) * DAY);
    firstDay.setUTCHours(0, 0, 0, 0);

    const [hour, day, week, month, daily, recent, top] = await Promise.all([
      store.countDeployments(since(HOUR)),
      store.countDeployments(since(DAY)),
      store.countDeployments(since(7 * DAY)),
      store.countDeployments(since(30 * DAY)),
      store.dailyDeployments(firstDay.toISOString()),
      store.recentDeployments(RECENT_DEPLOYMENTS),
      store.topInstallations(since(30 * DAY), TOP_INSTALLATIONS),
    ]);
    const byId = new Map(installs.map((i) => [i.id, i]));
    const account = (id: number) => byId.get(id)?.account || `#${id}`;

    const byDay = new Map(daily.map((d) => [d.day, d]));
    const days = Array.from({ length: CHART_DAYS }, (_, n) => {
      const date = new Date(firstDay.getTime() + n * DAY);
      const key = date.toISOString().slice(0, 10);
      const d = byDay.get(key) || { total: 0, succeeded: 0, failed: 0 };
      return { ...d, date, other: d.total - d.succeeded - d.failed };
    });
    const max = Math.max(1, ...days.map((d) => d.total));
    const pct = (n: number) => `${((n / max) * 100).toFixed(1)}%`;
    const label = (d: Date) =>
      d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });

    const finished = week.succeeded + week.failed;
    const monthAgo = now - 30 * DAY;
    return {
      deploys: { hour, day, week, month },
      successRate: finished
        ? `${Math.round((week.succeeded / finished) * 100)}%`
        : null,
      finished,
      failedWeek: week.failed,
      installCount: installs.length,
      userCount: users.length,
      activeUsers: users.filter((u) => Date.parse(u.updatedAt) >= monthAgo)
        .length,
      chart: {
        max,
        first: label(days[0].date),
        last: label(days[days.length - 1].date),
        days: days.map((d) => ({
          title: `${label(d.date)}: ${d.total} deploys, ${d.succeeded} succeeded, ${d.failed} failed`,
          succeeded: pct(d.succeeded),
          failed: pct(d.failed),
          other: pct(d.other),
        })),
      },
      top: top.map((t) => ({
        ...t,
        account: account(t.installationId),
        lastDeployed: ago(t.lastDeployedAt),
      })),
      hasTop: top.length > 0,
      recent: recent.map((d) => ({
        ...d,
        account: account(d.installationId),
        color: stateColors[d.state] || "secondary",
        state: d.state.replace("_", " "),
        created: ago(d.createdAt),
      })),
      hasRecent: recent.length > 0,
    };
  }

  async function index(req: AuthedRequest, res: Response) {
    const tab = tabs.includes(req.query.tab as string)
      ? (req.query.tab as string)
      : "overview";
    const [installs, users] = await Promise.all([
      store.list(),
      userService().list(),
    ]);
    const activeSince = Date.now() - ACTIVE_DAYS * DAY;
    const installations = installs.map((i) => ({
      ...i,
      repoCount: i.repositoryCount === null ? "?" : i.repositoryCount,
      configsChecked: !!i.configsSyncedAt,
      installed: ago(i.createdAt),
      lastActivity: i.lastActivityAt ? ago(i.lastActivityAt) : null,
      active: !!i.lastActivityAt && Date.parse(i.lastActivityAt) >= activeSince,
    }));
    res.render("admin", {
      title: "Admin",
      csrf: req.csrfToken(),
      user: user(req),
      tab: { [tab]: true },
      overview: tab === "overview" ? await overview(installs, users) : null,
      installations,
      hasInstallations: installations.length > 0,
      activeCount: installations.filter((i) => !i.suspended && i.active).length,
      activeDays: ACTIVE_DAYS,
      totalRepos: installs.reduce(
        (sum, i) => sum + (i.repositoryCount || 0),
        0,
      ),
      totalConfigured: installs.reduce((sum, i) => sum + i.configuredCount, 0),
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
    const install = Number.isSafeInteger(id)
      ? (await store.list()).find((i) => i.id === id)
      : undefined;
    if (!install) throw new NotFoundError("Installation not found");
    const page = pageParam(req.query);

    const [activity, configuredList] = await Promise.all([
      store.listActivity(id),
      store.listConfigured(id),
    ]);
    const byId = new Map(activity.map((a) => [a.id, a]));
    const configuredIds = new Set(configuredList.map((r) => r.id));
    const row = (
      r: { id: number; fullName: string; private?: boolean },
      a?: any,
    ) => ({
      fullName: r.fullName,
      private: !!r.private,
      configured: configuredIds.has(r.id),
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
          row(
            { id: r.id, fullName: r.full_name, private: r.private },
            byId.get(r.id),
          ),
        );
      } catch (error) {
        req.log.warn({ error, installation: id }, "admin: repo list failed");
        reposError = true;
      }
    }

    const recent = activity
      .slice(0, RECENT)
      .map((a) => row({ id: a.id, fullName: a.fullName }, a));
    const configured = configuredList.map((r) => row(r, byId.get(r.id)));

    res.render("admin-installation", {
      title: `Admin: ${install.account}`,
      csrf: req.csrfToken(),
      user: user(req),
      install,
      recent,
      hasRecent: recent.length > 0,
      configured,
      hasConfigured: configured.length > 0,
      configsChecked: !!install.configsSyncedAt,
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
