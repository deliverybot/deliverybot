import { Application } from "stimulus";

import "./partials";
import "turbolinks";

import { CommitsController } from "./controllers/commits";
import { MetricsController } from "./controllers/metrics";
import { RecentsController } from "./controllers/recents";
import { FormController } from "./controllers/form";
import { ToastController } from "./controllers/toast";
import { RefreshController } from "./controllers/refresh";

const application = Application.start();

application.register("commits", CommitsController);
application.register("metrics", MetricsController);
application.register("recents", RecentsController);
application.register("form", FormController);
application.register("toast", ToastController);

// Watcher defines how we can watch repositories for changes. This allows for
// registering a better watcher instead of just polling for changes.
export const registerWatcher = RefreshController.registerWatcher;
