import { Pool } from "pg";
import { logger, Dispatcher, WebhookEvent } from "@deliverybot/core";

export interface QueueOptions {
  /** Attempts before a job is marked failed. */
  maxAttempts: number;
  /** Delay before a retry, multiplied by the attempt number. */
  retryDelay: number;
  /**
   * How long a worker owns a job before another worker may take it over.
   * A job still running after this long is given up on and retried, so a
   * call that never returns can't hold a slot forever.
   */
  lease: number;
  /** How often an idle worker checks for new jobs. */
  pollInterval: number;
  /** Jobs processed at the same time by one worker. */
  concurrency: number;
  /**
   * Jobs of one installation running at the same time across all workers,
   * so one busy installation can't hold up everyone else. Best effort: two
   * workers claiming at the same moment can exceed it by one.
   */
  perInstallation: number;
  /**
   * Jobs with a higher priority are claimed first and skip the
   * per-installation limit. Meant for events a person is waiting on.
   */
  priority: (event: WebhookEvent) => number;
}

const defaults: QueueOptions = {
  maxAttempts: 5,
  retryDelay: 1000 * 12,
  lease: 1000 * 60 * 5,
  pollInterval: 1000,
  concurrency: 5,
  perInstallation: 2,
  priority: (event) => (event.name === "issue_comment" ? 1 : 0),
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
 * state 'failed' for inspection. An event whose id already has a job waiting
 * to run is dropped, since that job will see the same state.
 */
export class PostgresQueue {
  private opts: QueueOptions;
  private running = false;
  private inflight = new Set<Promise<void>>();
  private loop?: Promise<void>;
  private wake?: () => void;
  private lastLoop = Date.now();

  constructor(
    private pool: Pool,
    opts: Partial<QueueOptions> = {},
  ) {
    this.opts = { ...defaults, ...opts };
  }

  dispatcher: Dispatcher = async (event: WebhookEvent) => {
    await this.pool.query(
      `INSERT INTO jobs
         (name, data, max_attempts, installation_id, priority, event_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (event_id) WHERE state = 'queued' AND locked_until IS NULL
       DO NOTHING`,
      [
        event.name,
        JSON.stringify(event),
        this.opts.maxAttempts,
        installationId(event),
        this.opts.priority(event),
        event.id,
      ],
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

  /**
   * False once the worker loop hasn't come round for `maxAge` ms, which
   * means it is stuck, for example on a database connection that died
   * without being closed. Meant for a liveness probe.
   */
  healthy(maxAge = 1000 * 60 * 2) {
    return this.running && Date.now() - this.lastLoop < maxAge;
  }

  private async run(handler: (event: WebhookEvent) => Promise<void>) {
    while (this.running) {
      this.lastLoop = Date.now();
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
         SELECT id FROM jobs j
         WHERE state = 'queued' AND run_at <= now()
           AND (locked_until IS NULL OR locked_until < now())
           AND (
             priority > 0 OR installation_id IS NULL OR (
               SELECT count(*) FROM jobs r
               WHERE r.installation_id = j.installation_id
                 AND r.locked_until > now()
             ) < $2
           )
         ORDER BY priority DESC, run_at, id
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       RETURNING id, data, attempts, max_attempts`,
      [this.opts.lease, this.opts.perInstallation],
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
      await timeout(handler(job.data), this.opts.lease);
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
           WHERE id = $1 AND attempts = $5`,
          [
            job.id,
            failed ? "failed" : "queued",
            this.opts.retryDelay * job.attempts,
            String((error && error.stack) || error),
            // A job that timed out may have been claimed again already; the
            // newer attempt owns it then, so leave it alone.
            job.attempts,
          ],
        )
        .catch((error) =>
          // The same event was queued again while this job ran, so the
          // retry is redundant: the waiting job will handle it.
          error.code === "23505"
            ? this.pool.query(
                "DELETE FROM jobs WHERE id = $1 AND attempts = $2",
                [job.id, job.attempts],
              )
            : Promise.reject(error),
        )
        .catch((error) => log.error({ ...ctx, error }, "queue: update failed"));
    }
  }
}

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: NodeJS.Timeout;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      t = setTimeout(
        () => reject(new Error(`job timed out after ${ms}ms`)),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(t));
}

function installationId(event: WebhookEvent): number | null {
  const payload: any = event.payload;
  return (payload && payload.installation && payload.installation.id) || null;
}
