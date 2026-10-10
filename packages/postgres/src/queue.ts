import { Pool } from "pg";
import { logger, Dispatcher, WebhookEvent } from "@deliverybot/core";

export interface QueueOptions {
  /** Attempts before a job is marked failed. */
  maxAttempts: number;
  /** Delay before a retry, multiplied by the attempt number. */
  retryDelay: number;
  /** How long a worker owns a job before another worker may take it over. */
  lease: number;
  /** How often an idle worker checks for new jobs. */
  pollInterval: number;
  /** Jobs processed at the same time by one worker. */
  concurrency: number;
}

const defaults: QueueOptions = {
  maxAttempts: 5,
  retryDelay: 1000 * 12,
  lease: 1000 * 60 * 5,
  pollInterval: 1000,
  concurrency: 5,
};

interface Job {
  id: string;
  data: WebhookEvent;
  attempts: number;
  max_attempts: number;
}

const log = logger.child({ component: "queue" });

/**
 * Webhook event queue on Postgres. The web process enqueues events through
 * `dispatcher` and worker processes run them with `work`. Workers claim jobs
 * with `FOR UPDATE SKIP LOCKED`, so any number of them can run side by side,
 * and a job whose worker died is picked up again once its lease expires.
 * Finished jobs are deleted; jobs that fail every attempt stay with
 * state 'failed' for inspection.
 */
export class PostgresQueue {
  private opts: QueueOptions;
  private running = false;
  private inflight = new Set<Promise<void>>();
  private loop?: Promise<void>;
  private wake?: () => void;

  constructor(
    private pool: Pool,
    opts: Partial<QueueOptions> = {},
  ) {
    this.opts = { ...defaults, ...opts };
  }

  dispatcher: Dispatcher = async (event: WebhookEvent) => {
    await this.pool.query(
      "INSERT INTO jobs (name, data, max_attempts) VALUES ($1, $2, $3)",
      [event.name, JSON.stringify(event), this.opts.maxAttempts],
    );
  };

  work(handler: (event: WebhookEvent) => Promise<void>) {
    if (this.running) return;
    this.running = true;
    this.loop = this.run(handler);
  }

  /** Stops claiming jobs and waits for the ones in progress. */
  async stop() {
    this.running = false;
    if (this.wake) this.wake();
    await this.loop;
    await Promise.all(this.inflight);
  }

  private async run(handler: (event: WebhookEvent) => Promise<void>) {
    while (this.running) {
      let job: Job | undefined;
      if (this.inflight.size < this.opts.concurrency) {
        try {
          job = await this.claim();
        } catch (error) {
          log.error({ error }, "queue: claim failed");
        }
      }
      if (!job) {
        await this.sleep(this.opts.pollInterval);
        continue;
      }
      const p = this.process(job, handler).finally(() => {
        this.inflight.delete(p);
        if (this.wake) this.wake();
      });
      this.inflight.add(p);
    }
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => {
      const t = setTimeout(done, ms);
      function done() {
        clearTimeout(t);
        resolve();
      }
      this.wake = done;
    });
  }

  private async claim(): Promise<Job | undefined> {
    const { rows } = await this.pool.query<Job>(
      `UPDATE jobs
       SET attempts = attempts + 1,
           locked_until = now() + $1 * interval '1 millisecond'
       WHERE id = (
         SELECT id FROM jobs
         WHERE state = 'queued' AND run_at <= now()
           AND (locked_until IS NULL OR locked_until < now())
         ORDER BY run_at, id
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       RETURNING id, data, attempts, max_attempts`,
      [this.opts.lease],
    );
    return rows[0];
  }

  private async process(
    job: Job,
    handler: (event: WebhookEvent) => Promise<void>,
  ) {
    const ctx = {
      job: job.id,
      id: job.data.id,
      event: job.data.name,
      attempts: job.attempts,
    };
    log.info({ ...ctx, state: "processing" }, "queue: processing event");
    try {
      await handler(job.data);
      await this.pool.query("DELETE FROM jobs WHERE id = $1", [job.id]);
    } catch (error) {
      const failed = job.attempts >= job.max_attempts;
      log.warn(
        { ...ctx, error, state: failed ? "failed" : "retry" },
        failed ? "queue: max attempts hit" : "queue: error retrying",
      );
      await this.pool
        .query(
          `UPDATE jobs
           SET state = $2,
               run_at = now() + $3 * interval '1 millisecond',
               locked_until = NULL,
               last_error = $4
           WHERE id = $1`,
          [
            job.id,
            failed ? "failed" : "queued",
            this.opts.retryDelay * job.attempts,
            String((error && error.stack) || error),
          ],
        )
        .catch((error) => log.error({ ...ctx, error }, "queue: update failed"));
    }
  }
}
