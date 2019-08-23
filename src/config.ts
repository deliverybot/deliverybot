/**
 * APP_ID
 * PRIVATE_KEY
 * WEBHOOK_SECRET
 * CLIENT_ID
 * CLIENT_SECRET
 * BASE_URL
 * LOG_LEVEL
 * NODE_ENV="production"
 */

export const CLIENT_ID = process.env.CLIENT_ID;
export const CLIENT_SECRET = process.env.CLIENT_SECRET;
export const PRODUCTION = process.env.NODE_ENV === "production";
export const APP_SECRET = process.env.WEBHOOK_SECRET || "development";
export const BASE_URL = process.env.BASE_URL;
