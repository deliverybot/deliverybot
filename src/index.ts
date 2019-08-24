import { Application } from "probot";
import session from "client-sessions";
import bodyParser from "body-parser";
import express, { Request, Response, NextFunction } from "express";
import path from "path";
import { APP_SECRET, PRODUCTION } from "./config";

import { apps, handlers } from "./apps";

import "express-async-errors";

export = (robot: Application) => {
  const app = express();

  // Attach the probot log to the request object.
  app.use((req: Request, res: Response, next: NextFunction) => {
    (req as any).log = robot.log;
    next();
  });

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

  app.use(
    "/probot/static/",
    express.static(path.join(__dirname, "..", "static"))
  );

  const error5xx = path.join(__dirname, "..", "static", "5xx.html");
  const error404 = path.join(__dirname, "..", "static", "404.html");

  app.set("trust proxy", true);
  app.set("view engine", "hbs");
  app.set("views", path.join(__dirname, "..", "views"));

  const hbs = require("hbs");
  hbs.registerPartials(path.join(__dirname, "..", "views", "partials"));
  hbs.registerHelper("json", (arg: object) => JSON.stringify(arg, null, 2));

  app.use(bodyParser.json());

  // Register applications.
  apps.forEach(register => register(app));
  handlers.forEach(register => register(robot));

  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    (req as any).log.error({ error: err }, "request failed");
    res.status(500).sendFile(error5xx);
  });
  app.use((req: Request, res: Response) => {
    res.status(404).sendFile(error404);
  });

  robot.router.use(app);
};
