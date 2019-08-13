import { auth } from "./auth";
import { deploy } from "./deploy";
import { repo } from "./repo";
import { commands } from "./commands";

export const apps = [auth, deploy, repo];
export const handlers = [commands];
