/// <reference types="express" />

declare namespace Express {
  interface Request extends RequestExtras {}
}

interface RequestExtras {
  csrfToken: () => string;
  context: any;
  requestId: string;
}

declare module "turbolinks-express" {
  import { Request, Response, NextFunction } from "express";
  export function redirect(req: Request, res: Response, next: NextFunction);
  export function location(req: Request, res: Response, next: NextFunction);
}
