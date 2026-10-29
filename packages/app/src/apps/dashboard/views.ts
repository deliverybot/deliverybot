import { User } from "../auth.js";
import { InstallationStore } from "@deliverybot/core";
import * as queries from "./queries.js";

interface BaseProps {
  user: User;
  csrf: string;
  [k: string]: any;
}

function Base(props: BaseProps & { title: string }) {
  const user = props.user;
  return {
    // Sanitize user.
    ...props,
    user: {
      user: user.id,
      login: user.username,
      avatar: user.avatar,
    },
  };
}

/** A repository in the recent repositories sidebar. */
interface Recent {
  owner: string;
  repo: string;
}

interface IndexProps extends BaseProps {
  recents: Recent[];
}

export async function Index({ user, csrf, recents }: IndexProps) {
  const installs = await queries.installs(user);
  return Base({
    user,
    csrf,
    title: "Deliverybot",
    installs,
    hasInstalls: installs.length > 0,
    recents,
  });
}

interface ReposProps extends BaseProps {
  name: string;
  query: any;
  store: InstallationStore;
  recents: Recent[];
}

export async function Repos({
  user,
  name,
  query,
  csrf,
  store,
  recents,
}: ReposProps) {
  function getPage(params: any) {
    const { before, after } = params;
    if (before) {
      return Number(before);
    }
    if (after) {
      return Number(after);
    }
    return 1;
  }

  const page = getPage(query);
  const install = await queries.install(user, name);
  const setup = query.tab === "setup";
  const configured = await store.listConfigured(install.id);
  const list = setup ? queries.unconfiguredRepos : queries.configuredRepos;
  const { repos, hasNext } = await list(user, install, configured, page);
  const pagination = {
    prev: page <= 1 ? null : page - 1,
    next: hasNext ? page + 1 : null,
  };

  return Base({
    user,
    csrf,
    title: install.name,
    install,
    pagination,
    setup,
    url: { path: `/${install.name}`, query: setup ? "tab=setup&" : "" },
    hasRepos: repos.length > 0,
    repos,
    recents,
  });
}

export async function MySettings({ user, csrf }: BaseProps) {
  return Base({
    user,
    csrf,
    title: "My settings",
  });
}
