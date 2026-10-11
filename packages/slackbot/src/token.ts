export interface GitHubToken {
  token: string;
  /** Present when the GitHub App's user tokens expire. */
  refreshToken?: string;
  /** Milliseconds since the epoch. */
  expiresAt?: number;
}

const MINUTE = 60 * 1000;

/**
 * Returns a token that is valid for at least a few more minutes. GitHub App
 * user tokens expire after eight hours by default; an expired one is
 * refreshed and handed to `save`. Throws when it can't be refreshed, so the
 * user is asked to connect their GitHub account again.
 */
export async function freshToken<T extends GitHubToken>(
  github: T,
  config: { [k: string]: string | undefined },
  save: (github: T) => Promise<void>,
): Promise<T> {
  if (!github.expiresAt || github.expiresAt > Date.now() + 5 * MINUTE) {
    return github;
  }
  if (!github.refreshToken) {
    throw new Error("GitHub token expired");
  }

  const resp = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      client_id: config.githubClientId,
      client_secret: config.githubClientSecret,
      grant_type: "refresh_token",
      refresh_token: github.refreshToken,
    }),
  });
  const body = await resp.json();
  if (!body.access_token) {
    throw new Error(`GitHub token refresh failed: ${body.error}`);
  }
  const fresh = {
    ...github,
    token: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: body.expires_in
      ? Date.now() + body.expires_in * 1000
      : undefined,
  };
  await save(fresh);
  return fresh;
}
