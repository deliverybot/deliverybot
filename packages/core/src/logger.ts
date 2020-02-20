import Logger = require("bunyan");
import bunyanFormat = require("bunyan-format");

export const logger = new Logger({
  name: "deliverybot",
  level: toBunyanLogLevel(process.env.LOG_LEVEL),
  stream: new bunyanFormat({
    outputMode: toBunyanFormat(process.env.LOG_FORMAT),
    levelInString: true,
  }),
});

function toBunyanLogLevel(level?: string) {
  switch (level) {
    case "info":
    case "trace":
    case "debug":
    case "warn":
    case "error":
    case "fatal":
    case undefined:
      return level;
    default:
      return "info";
  }
}

function toBunyanFormat(format?: string) {
  switch (format) {
    case "short":
    case "long":
    case "simple":
    case "json":
    case "bunyan":
      return format;
    default:
      return "long";
  }
}

export { default as Logger } from "bunyan";
