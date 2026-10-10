import pino from "pino";

export type Logger = pino.Logger;

export const logger: Logger = pino({
  name: "deliverybot",
  level: process.env.LOG_LEVEL || "info",
});
