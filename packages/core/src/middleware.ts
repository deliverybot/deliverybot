import { Request, Response, NextFunction } from "express";
import { v4 as uuid } from "uuid";
import { logger } from "./logger";

export function logRequests(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  req.context = {};
  req.requestId = uuid();
  res.setHeader("x-request-id", req.requestId);
  req.log = logger.child({ id: req.requestId });
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
          secure: req.secure,
        },
        response: {
          content: res.getHeader("content-type"),
          status: res.statusCode,
        },
        duration: Date.now() - start,
      },
      `request ${req.method} ${req.path} status=${res.statusCode}`,
    );
  });
  next();
}
