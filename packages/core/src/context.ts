import Webhooks, { PayloadRepository } from "@octokit/webhooks";
import { Octokit } from "@octokit/rest";
import { Logger } from "./logger";

interface WebhookPayloadWithRepository {
  [key: string]: any;
  repository?: PayloadRepository;
  issue?: {
    [key: string]: any;
    number: number;
    html_url?: string;
    body?: string;
  };
  pull_request?: {
    [key: string]: any;
    number: number;
    html_url?: string;
    body?: string;
  };
  sender?: {
    [key: string]: any;
    type: string;
  };
  action?: string;
  installation?: {
    id: number;
    [key: string]: any;
  };
}

/**
 * The context of the event that was triggered, including the payload and
 * helpers for extracting information can be passed to GitHub API calls.
 *
 *  ```js
 *  module.exports = app => {
 *    app.on('push', context => {
 *      context.log('Code was pushed to the repo, what should we do with it?');
 *    });
 *  };
 *  ```
 *
 * @property {github} github - A GitHub API client
 * @property {payload} payload - The webhook event payload
 * @property {logger} log - A logger
 */

export class Context<E extends WebhookPayloadWithRepository = any>
  implements Webhooks.WebhookEvent<E> {
  public name: string;
  public id: string;
  public payload: E;
  public protocol?: "http" | "https";
  public host?: string;
  public url?: string;

  public github: Octokit;
  public log: Logger;

  constructor(event: Webhooks.WebhookEvent<E>, github: Octokit, log: Logger) {
    this.name = event.name;
    this.id = event.id;
    this.payload = event.payload;
    this.protocol = event.protocol;
    this.host = event.host;
    this.url = event.url;

    this.github = github;
    this.log = log;
  }

  // Maintain backward compatibility
  public get event(): string {
    return this.name;
  }

  /**
   * Return the `owner` and `repo` params for making API requests against a
   * repository.
   *
   * ```js
   * const params = context.repo({path: '.github/config.yml'})
   * // Returns: {owner: 'username', repo: 'reponame', path: '.github/config.yml'}
   * ```
   *
   * @param object - Params to be merged with the repo params.
   *
   */
  public repo<T>(object?: T) {
    const repo = this.payload.repository;

    if (!repo) {
      throw new Error(
        "context.repo() is not supported for this webhook event.",
      );
    }

    return Object.assign(
      {
        owner: repo.owner.login || repo.owner.name!,
        repo: repo.name,
      },
      object,
    );
  }

  /**
   * Return the `owner`, `repo`, and `number` params for making API requests
   * against an issue or pull request. The object passed in will be merged with
   * the repo params.
   *
   * ```js
   * const params = context.issue({body: 'Hello World!'})
   * // Returns: {owner: 'username', repo: 'reponame', number: 123, body: 'Hello World!'}
   * ```
   *
   * @param object - Params to be merged with the issue params.
   */
  public issue<T>(object?: T) {
    const payload = this.payload;
    return Object.assign(
      {
        number: (payload.issue || payload.pull_request || payload).number,
      },
      this.repo(object),
    );
  }

  /**
   * Returns a boolean if the actor on the event was a bot.
   * @type {boolean}
   */
  get isBot() {
    return this.payload.sender!.type === "Bot";
  }
}
