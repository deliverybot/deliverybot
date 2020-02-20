import * as admin from "firebase-admin";
import { PubSub, Topic } from "@google-cloud/pubsub";
import { Message } from "firebase-functions/lib/providers/pubsub";
import Webhooks from "@octokit/webhooks";
import { logger } from "@deliverybot/core";

interface Event extends Webhooks.WebhookEvent<any> {
  attempts?: number;
}

type Dispatcher = (event: Webhooks.WebhookEvent<any>) => Promise<void>;

interface Application {
  receive: (payload: any) => Promise<any>;
  withDispatcher: (d: Dispatcher) => Application;
}

export class FirebasePubSubStore {
  static TOPIC = "deliverybot";
  static MAX_ATTEMPTS = 5;
  static WAIT_MS = 12000;

  pubsub: PubSub;
  firebase: admin.app.App;
  topic: Topic;
  dispatcher: Dispatcher;

  constructor(firebase: admin.app.App) {
    this.firebase = firebase;
    this.pubsub = new PubSub();
    this.topic = this.pubsub.topic(FirebasePubSubStore.TOPIC);
    this.dispatcher = this.publish.bind(this);
  }

  async publish(data: Event) {
    await this.topic.publishJSON(data);
  }

  receiver(bot: Application) {
    const log = logger.child({ component: "pubsub" });
    log.info("loaded pubsub bot");

    return async (message: Message): Promise<void> => {
      const event = message.json as Event;
      log.info(
        {
          id: event.id,
          event: event.name,
          attempts: event.attempts,
          state: "processing",
        },
        "pubsub: received event",
      );
      try {
        await bot.receive(event);
      } catch (error) {
        if ((event.attempts || 0) < FirebasePubSubStore.MAX_ATTEMPTS) {
          try {
            await sleep(FirebasePubSubStore.WAIT_MS);
            log.warn(
              {
                id: event.id,
                event: event.name,
                attempts: (event.attempts || 0) + 1,
                state: "retry",
              },
              "pubsub: error retrying",
            );
            await this.publish({
              ...event,
              attempts: (event.attempts || 0) + 1,
            });
          } catch (error) {
            log.error(
              { id: event.id, event: event.name, error, state: "failed" },
              "pubsub: error retry failed",
            );
          }
        } else {
          log.error(
            { id: event.id, event: event.name, error, state: "cancelled" },
            "pubsub: error max attempts hit",
          );
        }
      }
    };
  }
}

const sleep = (n: number) => new Promise(resolve => setTimeout(resolve, n));
