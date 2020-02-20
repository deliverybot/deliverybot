import { createHash } from "crypto";
import { Context, Octokit } from "@deliverybot/core";

export function hash(chunk: string[]) {
  const h = createHash("sha256");
  h.write(chunk.join("|"));
  return h.digest("hex");
}

const previewAnt = "application/vnd.github.ant-man-preview+json";
const previewFlash = "application/vnd.github.flash-preview+json";

export function withPreview<T>(arg: T): T {
  (arg as any).headers = { accept: `${previewAnt},${previewFlash}` };
  return arg as T;
}

export function logCtx(context: Context, params: any) {
  return {
    context: {
      installation: context.payload.installation,
      repo: context.payload.repository ? context.repo() : undefined,
    },
    ...params,
  };
}

export async function canWrite(
  gh: Octokit,
  { owner, repo, username }: { owner: string; repo: string; username: string },
): Promise<boolean> {
  const perms = await gh.repos.getCollaboratorPermissionLevel({
    owner,
    repo,
    username,
  });
  return ["admin", "write"].includes(perms.data.permission);
}
