/// <reference types="express" />

declare namespace Express {
  interface Request extends RequestExtras {}
}

interface RequestExtras {
  session?: any;
  context: any;
  log: Logger;
  requestId: string;
}

declare module "turbolinks-express" {
  import { Request, Response, NextFunction } from "express";
  export function redirect(req: Request, res: Response, next: NextFunction);
  export function location(req: Request, res: Response, next: NextFunction);
}
