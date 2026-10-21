import { Services } from "./services.js";
import { RegisterFunc, Options, load } from "./app.js";
import { logger } from "./logger.js";

export function serve(
  services: Services,
  register: RegisterFunc[],
  opts: Options,
  port: number,
) {
  const server = load(services, register, opts).express.listen(port, () => {
    logger.info(`listening on port ${port}`);
  });

  ["SIGINT", "SIGTERM", "SIGQUIT"].forEach((sig) =>
    process.on(sig as any, () => {
      setTimeout(() => {
        process.exit(1);
      }, 5000);
      console.log("handling", sig);
      server.close((err) => {
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

export {
  Application,
  Context,
  Dispatcher,
  EventFilter,
  Octokit,
  WebhookEvent,
  WebhookPayload,
} from "./github.js";
export type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";
export { Logger, logger } from "./logger.js";
export { sessions, csrf, EncryptedStore } from "./session.js";
export { Dependencies, RegisterFunc, Options, load } from "./app.js";
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
  UserRecord,
  KVService,
  KVStore,
  Installation,
  InstallationService,
  InstallationStore,
  InstallationRecord,
  RepositoryActivity,
  ConfiguredRepository,
  Deployment,
  DeploymentCounts,
  DailyDeployments,
  InstallationDeployments,
} from "./services.js";
export { local as localServices } from "./local/index.js";
