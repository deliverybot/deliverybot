import { KVStore, KVService } from "@deliverybot/core";
import { GitHubToken } from "./token.js";

export interface SlackUser {
  slack: {
    id: string;
  };
  github: GitHubToken & {
    id: string;
    username: string;
  };
}

export class SlackUserStore {
  kv: KVStore<SlackUser>;

  constructor(kvService: KVService) {
    this.kv = kvService();
  }

  get(slackId: string): Promise<SlackUser | undefined> {
    return this.kv.get(`slack/${slackId}`);
  }

  associate(user: SlackUser) {
    return this.kv.put(`slack/${user.slack.id}`, user);
  }
}
