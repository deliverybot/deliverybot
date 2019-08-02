import { Application } from "probot";
import session from "client-sessions";
import bodyParser from "body-parser";
import express, { Request, Response, NextFunction } from "express";
import path from "path";
import { APP_SECRET, PRODUCTION } from "./config";

import { apps } from "./apps";
import { handlers } from "./handlers";

import 'express-async-errors';

export = (robot: Application) => {
  const app = express();
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.secure) (req.connection as any).proxySecure = true;
    next();
  });

  app.use(
    session({
      cookieName: "session",
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
  app.set("trust proxy", true);
  app.set("view engine", "hbs");
  app.set("views", path.join(__dirname, "..", "views"));

  const hbs = require('hbs');
  hbs.registerPartials(path.join(__dirname, "..", "views", "partials"));

  app.use(bodyParser.json());

  // Register applications.
  apps.forEach(register => register(app));
  handlers.forEach(register => register(robot));

  robot.router.use(app);
};
