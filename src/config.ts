/**
 * -- Required
 * APP_ID
 * PRIVATE_KEY
 * WEBHOOK_SECRET
 * CLIENT_ID
 * CLIENT_SECRET
 * BASE_URL
 *
 * -- Optional
 * LOG_LEVEL
 * EXEC_CLIENT="gcp-build|memory"
 * SECRET_CLIENT="gcp-storage|memory"
 * NODE_ENV="production"
 */

export const SecretClients = {
  GCPStorage: "gcp-storage",
  Memory: "memory"
};

export const ExecClients = {
  GCPBuild: "gcp-build",
  None: "none"
};

export const CLIENT_ID = process.env.CLIENT_ID;
export const CLIENT_SECRET = process.env.CLIENT_SECRET;
export const PRODUCTION = process.env.NODE_ENV === "production";
export const APP_SECRET = process.env.WEBHOOK_SECRET || "development";
export const BASE_URL = process.env.BASE_URL;

export const SECRET_CLIENT = process.env.SECRET_CLIENT
  ? process.env.SECRET_CLIENT
  : PRODUCTION
  ? SecretClients.GCPStorage
  : SecretClients.Memory;
export const EXEC_CLIENT = process.env.EXEC_CLIENT
  ? process.env.EXEC_CLIENT
  : PRODUCTION
  ? ExecClients.GCPBuild
  : ExecClients.None;

export const EXECUTOR_WHITELIST = process.env.EXECUTOR_WHITELIST === "true";
export const EXECUTORS: { [k: string]: string | undefined } = {
  "cloud-run": "colinjfw/cloud-run:latest",
  "helm": "colinjfw/helm:latest",
}
