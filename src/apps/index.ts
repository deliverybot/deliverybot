import { auth } from "./auth";
import { deploy } from "./deploy";
import { repo } from "./repo";
import { secrets } from "./secrets";
import { logs } from "./logs";

export const apps = [auth, deploy, repo, secrets, logs];
