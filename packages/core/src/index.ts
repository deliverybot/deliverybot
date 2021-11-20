import { Services } from "./services";
import { RegisterFunc, Options, load } from "./app";
import { logger } from "./logger";

export function serve(
  services: Services,
  register: RegisterFunc[],
  opts: Options,
  port: number,
) {
  const server = load(services, register, opts).express.listen(port, () => {
    logger.info(`listening on port ${port}`);
  });

  ["SIGINT", "SIGTERM", "SIGQUIT"].forEach(sig =>
    process.on(sig as any, () => {
      setTimeout(() => {
        process.exit(1);
      }, 5000);
      console.log("handling", sig);
      server.close(err => {
        if (err) {
          console.log("error closing server", err);
          process.exit(1);
          return;
        }
        process.exit(0);
      });
    }),
  );
}

export { Application } from "./application";
export { Context } from "./context";
export { Logger, logger } from "./logger";
export { Dependencies, RegisterFunc, Options, load } from "./app";
export {
  Services,
  User,
  UnimplementedError,
  LockError,
  LockService,
  LockStore,
  MessageService,
  MessageBus,
  UserService,
  UserStore,
  KVService,
  KVStore,
} from "./services";
export { local as localServices } from "./local";
export { Octokit } from "@octokit/rest";
