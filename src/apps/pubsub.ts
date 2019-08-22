import { Application } from "probot";
import { PubSub } from "@google-cloud/pubsub";

export function pubsub(app: Application) {
  if (!process.env.PUBSUB_ENABLED) {
    return;
  }

  const pubsub = new PubSub();
  const topicName = "deliverybot";

  app.on("*", async context => {
    const data = JSON.stringify(context.payload);
    const dataBuffer = Buffer.from(data);
    await pubsub.topic(topicName).publish(dataBuffer);
  });
}
