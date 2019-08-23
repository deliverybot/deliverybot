import { auth } from "./auth";
import { deploy } from "./deploy";
import { home } from "./home";
import { commands } from "./commands";

export const apps = [auth, deploy, home];
export const handlers = [commands];
