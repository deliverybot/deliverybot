import { Application, probot } from "./probot";
import { Express, Handler } from "express";
import { KVStore, LockStore } from "./store";
import session from "client-sessions";
import bodyParser from "body-parser";
import express, { Request, Response, NextFunction } from "express";
import path from "path";
import csurf from "csurf";
import { logRequests } from "./logger"

import { APP_SECRET, PRODUCTION } from "./config";
import * as turbolinks from "turbolinks-express";

import "express-async-errors";

interface Services {
  kvStore: <T>() => KVStore<T>;
  lockStore: () => LockStore;
}

export interface Dependencies extends Services {
  robot: Application;
  app: Express;
  csrf: Handler;
}

type RegisterFunc = (d: Dependencies) => void;

export const getApp = (apps: RegisterFunc[], services: Services) => {
  const app = express();
  const robot = probot(app);

  // Attach the probot log to the request object.
  app.use(logRequests);

  // Hack for client-sessions. It uses a different field to query whether the
  // connection is secure.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.secure) (req.connection as any).proxySecure = true;
    next();
  });

  // Cache negotiation options middleware.
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Ensure that cache-control private is set so firebase or intermediate
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
      secret: APP_SECRET,
      duration: 24 * 60 * 60 * 1000,
      cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: PRODUCTION
      }
    })
  );

  // Application and parsing middleware.
  app.use(bodyParser.urlencoded({verify: rawBodyBuffer, extended: true }));
  app.use(bodyParser.json({ verify: rawBodyBuffer }));

  app.use("/static/", express.static(path.join(__dirname, "..", "static")));

  const error5xx = path.join(__dirname, "..", "static", "5xx.html");
  const error404 = path.join(__dirname, "..", "static", "404.html");

  app.set("trust proxy", true);
  app.set("view engine", "hbs");
  app.set("views", path.join(__dirname, "..", "views"));

  const hbs = require("hbs");
  hbs.registerPartials(
    path.join(__dirname, "..", "views", "partials"),
    // Partials load async so we emit an event where a caller can listen to
    // handle partials being loaded up.
    () => {
      app.emit("app.partials-loaded");
    }
  );

  app.use(turbolinks.redirect);
  app.use(turbolinks.location);

  apps.forEach(register =>
    register({
      ...services,
      csrf: csurf(),
      app,
      robot
    })
  );

  app.get("/app/config", (req: Request, res: Response) => {
    res.json({});
  });

  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    req.log.error({ error: err.message, errorObj: err }, "request failed");
    if (process.env.NODE_ENV === "development") {
      console.error(err);
    }
    res.status(500).sendFile(error5xx);
  });
  app.use((req: Request, res: Response) => {
    res.status(404).sendFile(error404);
  });

  return {
    express: app,
    probot: robot,
    loaded: () => {
      return new Promise((resolve, reject) => {
        app.on("app.partials-loaded", () => {
          resolve();
        });
      });
    },
  };
};

export function rawBodyBuffer(req: Request, res: Response, buf: Buffer, encoding: string) {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || 'utf8');
  }
};
