import { Logger, Octokit } from "@deliverybot/core";
import { AccessError, ConfigError, Target, Targets } from "./types.js";

/**
 * Picks the targets whose `deployers` list applies to a deploy of `target` to
 * `environment`: the target with that name, and any other target that deploys
 * to the same (non-templated) environment. The second rule stops someone from
 * adding an unrestricted target that points at a restricted environment.
 */
export function restrictionsFor(
  targets: Targets,
  target: string,
  environment: string,
): Target[] {
  return Object.values(targets).filter(
    (t): t is Target =>
      !!t &&
      Array.isArray(t.deployers) &&
      (t.name === target ||
        (!!t.environment &&
          !t.environment.includes("${{") &&
          t.environment === environment)),
  );
}

/** Splits `org/team` (optionally `@org/team`) into its parts. */
export function parseTeam(entry: string) {
  const match = entry.replace(/^@/, "").match(/^([^/\s]+)\/([^/\s]+)$/);
  return match ? { org: match[1], team_slug: match[2] } : undefined;
}

async function isTeamMember(
  github: Octokit,
  log: Logger,
  team: { org: string; team_slug: string },
  username: string,
) {
  try {
    const membership = await github.rest.teams.getMembershipForUserInOrg({
      ...team,
      username,
    });
    return membership.data.state === "active";
  } catch (error) {
    // 404 means "not a member". A 403 means the app can't read team
    // membership (the Members permission), which also counts as no access.
    if (error.status !== 404) {
      log.warn({ error, team }, "deploy: team membership lookup failed");
    }
    return false;
  }
}

/**
 * True when `username` is listed in `deployers`, directly or via a team.
 * `teamCache` lets several lists share one lookup per team.
 */
export async function isDeployer(
  github: Octokit,
  log: Logger,
  deployers: string[],
  username: string,
  teamCache = new Map<string, Promise<boolean>>(),
) {
  const login = username.toLowerCase();
  const teams = [];
  for (const entry of deployers) {
    const team = parseTeam(entry);
    if (team) {
      teams.push(team);
    } else if (entry.replace(/^@/, "").toLowerCase() === login) {
      return true;
    }
  }
  for (const team of teams) {
    const key = `${team.org}/${team.team_slug}`.toLowerCase();
    if (!teamCache.has(key)) {
      teamCache.set(key, isTeamMember(github, log, team, username));
    }
    if (await teamCache.get(key)) return true;
  }
  return false;
}

/**
 * Reads the default branch's deploy.yml. Restrictions come from there so a
 * branch can't lift them by editing its own copy of the file. A missing or
 * invalid file means there are no restrictions to apply from it; whoever can
 * change the default branch could remove them anyway.
 */
async function defaultBranchConfig(
  load: () => Promise<Targets>,
  log: Logger,
): Promise<Targets> {
  try {
    return await load();
  } catch (error) {
    if (error.status === 404 || error instanceof ConfigError) {
      log.info({ error }, "deploy: no usable deploy.yml on default branch");
      return {};
    }
    throw error;
  }
}

/**
 * Throws AccessError unless `actor` passes every `deployers` list that applies
 * to this deploy, from both the deployed ref's config and the default
 * branch's config.
 */
export async function checkAccess(
  github: Octokit,
  log: Logger,
  {
    actor,
    target,
    environment,
    refTargets,
    loadDefaultTargets,
  }: {
    actor: string;
    target: string;
    environment: string;
    refTargets: Targets;
    loadDefaultTargets: () => Promise<Targets>;
  },
) {
  const defaultTargets = await defaultBranchConfig(loadDefaultTargets, log);
  const restrictions = [
    ...restrictionsFor(refTargets, target, environment),
    ...restrictionsFor(defaultTargets, target, environment),
  ];
  const teamCache = new Map<string, Promise<boolean>>();
  for (const restriction of restrictions) {
    const { deployers } = restriction;
    if (!(await isDeployer(github, log, deployers!, actor, teamCache))) {
      throw new AccessError(actor, restriction.name, restriction.deployers!);
    }
  }
}
