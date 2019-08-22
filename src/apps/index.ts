import { auth } from "./auth";
import { deploy } from "./deploy";
import { home } from "./home";
import { commands } from "./commands";
import { pubsub } from "./pubsub";

export const apps = [auth, deploy, home];
export const handlers = [commands, pubsub];
