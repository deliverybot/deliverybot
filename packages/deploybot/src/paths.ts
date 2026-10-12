/**
 * Normalizes a target's `path` to a repository-relative path without leading
 * or trailing slashes, so "./services/api/" becomes "services/api". Returns
 * undefined for paths that mean the whole repository ("", ".", "/").
 */
export function normalizePath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const normalized = path
    .trim()
    .replace(/^(\.\/|\/)+/, "")
    .replace(/\/+$/, "");
  return normalized && normalized !== "." ? normalized : undefined;
}

/** Whether any of the changed files is the path itself or lives below it. */
export function touches(path: string, files: string[]) {
  return files.some((file) => file === path || file.startsWith(`${path}/`));
}
