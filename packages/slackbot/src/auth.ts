import { Octokit } from "@deliverybot/core";
import { Response, Request, NextFunction } from "express";

export interface User {
  id: string;
  username: string;
  token: string;
  avatar: string;
  github: Octokit;
}

export interface AuthedRequest extends Request {
  user?: User;
}

function setUser(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.session.token;
  if (!token) {
    return next();
  }
  const { userId: id, avatar, login: username } = req.session;
  if (!id || !username) {
    return next();
  }
  const github = new Octokit({ auth: token });
  req.user = { id, avatar: avatar || "", github, token, username };
  next();
}

export function authenticate(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  const token = req.session.token;
  if (!token) {
    (req as any).log.info("unauthenticated access redirecting");
    req.session.next = req.url;
    res.redirect("/login");
    return;
  }
  setUser(req, res, next);
}
