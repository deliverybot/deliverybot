/// <reference types="express" />

declare namespace Express {
  interface Request extends RequestExtras {}
}

interface RequestExtras {
  session?: any;
  context: any;
  log: Logger;
  requestId: string;
  rawBody?: string;
  csrfToken: () => string;
}
