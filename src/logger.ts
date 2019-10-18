import { Request, Response, NextFunction } from "express";
import { v4 as uuid } from "uuid";

export interface Logger {
  trace(obj: Object, ...params: any[]): void;
  trace(format: any, ...params: any[]): void;

  debug(obj: Object, ...params: any[]): void;
  debug(format: any, ...params: any[]): void;

  info(obj: Object, ...params: any[]): void;
  info(format: any, ...params: any[]): void;

  error(obj: Object, ...params: any[]): void;
  error(format: any, ...params: any[]): void;

  warn(obj: Object, ...params: any[]): void;
  warn(format: any, ...params: any[]): void;

  child(obj: Object): Logger;
}

export const consoleLogger: Logger = {
  child(obj: Object) {
    return consoleLogger;
  },
  trace(...args: any[]) {
    console.log(...args);
  },
  debug(...args: any[]) {
    console.log(...args);
  },
  info(...args: any[]) {
    console.log(...args);
  },
  error(...args: any[]) {
    console.log(...args);
  },
  warn(...args: any[]) {
    console.log(...args);
  }
};

export const noLogger: Logger = {
  child(obj: Object) {
    return noLogger;
  },
  trace(...args: any[]) {},
  debug(...args: any[]) {},
  info(...args: any[]) {},
  error(...args: any[]) {},
  warn(...args: any[]) {}
};

export let defaultLogger = noLogger;

export function setDefaultLogger(logger: Logger) {
  defaultLogger = logger;
}

export function logRequests(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  req.context = {};
  req.requestId = uuid();
  res.setHeader("x-request-id", req.requestId);
  req.log = defaultLogger.child({ id: req.requestId });
  res.on("finish", () => {
    if ((req as any).user) {
      const user = (req as any).user;
      req.context.user = { id: user.id };
      if (user.repo) {
        req.context.repo = user.repo;
      }
    }
    req.log.info(
      {
        id: req.requestId,
        name: "http",
        context: req.context,
        request: {
          method: req.method,
          content: req.get("content-type"),
          accept: req.get("accept"),
          url: req.url,
          query: req.query,
          params: req.params,
          protocol: req.protocol,
          secure: req.secure
        },
        response: {
          content: res.getHeader("content-type"),
          status: res.statusCode
        },
        duration: Date.now() - start
      },
      `request ${req.method} ${req.path} status=${res.statusCode}`
    );
  });
  next();
};
