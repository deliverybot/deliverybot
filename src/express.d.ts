/// <reference types="express" />

declare namespace Express {
  interface Request {
    session: any;
    log: any;
  }
}

declare module "turbolinks-express" {
  import { Request, Response, NextFunction } from "express";
  export function redirect(req: Request, res: Response, next: NextFunction);
  export function location(req: Request, res: Response, next: NextFunction);
}
