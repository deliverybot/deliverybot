import { KVStore, KVService } from "@deliverybot/core";

export interface SlackUser {
  slack: {
    id: string;
  };
  github: {
    id: string;
    token: string;
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
