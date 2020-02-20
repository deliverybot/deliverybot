import "@deliverybot/client/styles/primer.css";
import "@deliverybot/client/styles/main.css";

import { registerWatcher } from "@deliverybot/client";
import { watcher } from "./firebase";
import "./stackdriver";

registerWatcher(watcher);
