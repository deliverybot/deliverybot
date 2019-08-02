/// <reference types="express" />

declare namespace Express {
  interface Request extends SessionRequest {}
}

interface SessionRequest {
  /**
   * Represents the session for the given request.
   */
  session?: any;
}
