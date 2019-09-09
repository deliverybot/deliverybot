import { auth } from "./auth";
import { deploy } from "./deploy";
import { home } from "./home";
import { commands } from "./commands";

export const apps = [home, auth, deploy];
export const handlers = [commands];
