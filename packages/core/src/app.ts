import session from "client-sessions";
import * as turbolinks from "turbolinks-express";
import bodyParser from "body-parser";
import express, {
  Request,
  Response,
  NextFunction,
  Express,
  Handler,
} from "express";
import path from "path";
import csurf from "csurf";
import "express-async-errors";

import { logRequests } from "./middleware";
import { Application, probot, AppOptions } from "./probot";
import { Dispatcher } from "./application";
import { Services } from "./services";

export interface Dependencies extends Services {
  robot: Application;
  app: Express;
  csrf: Handler;
  registerHelper: (name: string, h: (ctx: any) => string) => void;
  registerPartial: (name: string, val: string) => void;
  config: { [k: string]: string | undefined };
}

export type RegisterFunc = (d: Dependencies) => void;

export interface Options extends AppOptions {
  production: boolean;
  root: string;
  scripts: string;
  serve: [string, string][];
  locals: any;
  config: { [k: string]: string | undefined };
  dispatcher?: Dispatcher;
}

export function load(services: Services, apps: RegisterFunc[], opts: Options) {
  const app = express();
  const robot = probot(opts, app);

  // Attach the probot log to the request object.
  app.use(logRequests);

  // Hack for client-sessions. It uses a different field to query whether the
  // connection is secure.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.secure) (req.connection as any).proxySecure = true;
    next();
  });

  app.locals.info = opts.locals;

  // Cache negotiation options middleware.
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Ensure that cache-control private is set so intermediate
    // CDN's don't store these pages in a global cache. Vary on the
    res.setHeader("cache-control", "private");
    // Vary on the accept header since we use accept in places to return json
    // with specific endpoints.
    res.setHeader("vary", "accept");
    next();
  });

  // Initialize the client-sessions. For deployment to firebase the cookie must
  // be __session.
  app.use(
    session({
      requestKey: "session",
      cookieName: "__session",
      secret: opts.appSecret,
      duration: 24 * 60 * 60 * 1000,
      cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: opts.production,
      },
    }),
  );

  // Application and parsing middleware.
  app.use(bodyParser.urlencoded({ verify: rawBodyBuffer, extended: true }));
  app.use(bodyParser.json({ verify: rawBodyBuffer }));
  opts.serve.forEach(val => {
    const handler = express.static(val[1]);
    app.use(val[0], handler);
  });

  const root = opts.root;
  app.use(express.static(path.join(root, "public", "static")));

  const error5xx = path.join(root, "public", "static", "5xx.html");
  const error404 = path.join(root, "public", "static", "404.html");

  app.set("error404", error404);
  app.set("error5xx", error5xx);

  app.set("trust proxy", true);
  app.set("view engine", "hbs");
  app.set("views", path.join(root, "views"));

  const hbs = require("hbs");
  hbs.localsAsTemplateData(app);
  hbs.registerPartial("scripts", opts.scripts);
  hbs.registerPartials(
    path.join(root, "views", "partials"),
    // Partials load async so we emit an event where a caller can listen to
    // handle partials being loaded up.
    () => {
      app.emit("app.partials-loaded");
    },
  );

  app.use(turbolinks.redirect);
  app.use(turbolinks.location);

  apps.forEach(register =>
    register({
      ...services,
      registerHelper: hbs.registerHelper.bind(hbs),
      registerPartial: hbs.registerPartial.bind(hbs),
      config: opts.config,
      csrf: csurf(),
      app,
      robot,
    }),
  );

  // If an error has a status of 404 we send back the error 404 page.
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (err.status === 404) {
      res.status(404).sendFile(error404);
      return;
    }
    next(err);
  });

  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    req.log.error(
      { fields: err, error: err.message, stack: err.stack },
      "request failed",
    );
    if (process.env.NODE_ENV === "development") {
      console.error(err);
    }
    res.status(500).sendFile(error5xx);
  });

  app.use((req: Request, res: Response) => {
    res.status(404).sendFile(error404);
  });

  if (opts.dispatcher) robot.withDispatcher(opts.dispatcher);
  return {
    express: app,
    probot: robot,
    loaded: () => {
      return new Promise<void>((resolve, reject) => {
        app.on("app.partials-loaded", () => {
          resolve();
        });
      });
    },
  };
}

export function rawBodyBuffer(
  req: Request,
  res: Response,
  buf: Buffer,
  encoding: BufferEncoding,
) {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || "utf8");
  }
}
