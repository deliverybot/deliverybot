import { Response } from "express";
import { AuthedRequest, authenticate, verifyRepo } from "./auth";
import { Dependencies, MessageService, logger } from "@deliverybot/core";

export interface RepoUpdatedMessage {
  id: number;
  updatedAt: string;
}

export function publishRepoUpdated(
  messageService: MessageService,
  repo: { id: number },
) {
  const messageBus = messageService<RepoUpdatedMessage>();
  messageBus
    .publish(`repos/${repo.id}`, {
      id: repo.id,
      updatedAt: new Date().toISOString(),
    })
    .catch(err => {
      logger.error({ error: err }, "failed to publish repo update");
    });
}

/**
 * Watch sets up the message bus app.
 */
export function watch({ app, robot, messageService }: Dependencies) {
  const messageBus = messageService<RepoUpdatedMessage>();

  app.get(
    "/_/watch/:owner/:repo",
    authenticate,
    verifyRepo,
    async (req: AuthedRequest, res: Response) => {
      const user = req.user!;
      const repo = user.repo!;
      req.log.info({ repoId: repo.id, userId: user.id }, "subscribing");
      const token = await messageBus.subscribe(`repos/${repo.id}`, user);
      try {
        await messageBus.poll(`repos/${repo.id}`, user);
        res.json({ continue: true, id: repo.id, token });
      } catch (error) {
        res.json({ continue: false, id: repo.id, token });
      }
    },
  );

  robot.on("*", async context => {
    const repo = context.payload.repository;
    if (!repo) {
      return;
    }
    publishRepoUpdated(messageService, repo);
  });
}
