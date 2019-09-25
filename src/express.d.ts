/// <reference types="express" />

declare namespace Express {
  interface Request {
    session: any;
    log: any;
  }
}
