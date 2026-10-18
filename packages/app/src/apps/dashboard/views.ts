import { User } from "../auth.js";
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

export async function Index({ user, csrf }: BaseProps) {
  const installs = await queries.installs(user);
  return Base({
    user,
    csrf,
    title: "Deliverybot",
    installs,
    hasInstalls: installs.length > 0,
  });
}

interface ReposProps extends BaseProps {
  name: string;
  query: any;
}

export async function Repos({ user, name, query, csrf }: ReposProps) {
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
  const { repos, hasNext } = await queries.repos(user, install, page, setup);
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
  });
}

export async function MySettings({ user, csrf }: BaseProps) {
  return Base({
    user,
    csrf,
    title: "My settings",
  });
}
