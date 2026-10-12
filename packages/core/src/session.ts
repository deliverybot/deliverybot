import crypto from "crypto";
import session, { Store, SessionData } from "express-session";
import { Request, Response, NextFunction, Handler } from "express";

declare module "express-session" {
  interface SessionData {
    /** GitHub OAuth token of the signed in user. */
    token: string;
    /** Refreshes `token` when the GitHub App's user tokens expire. */
    refreshToken: string;
    /** When `token` expires, in milliseconds since the epoch. */
    tokenExpiresAt: number;
    userId: string;
    login: string;
    avatar: string;
    /** Whether this session's user is in the users table. */
    userRecorded: boolean;
    /** Where to go after signing in. */
    next: string;
    /** Repos the user has write access to, by "owner/repo". */
    verified: { [repo: string]: { id: number; defaultBranch: string } };
    slackId: string;
    /** OAuth state of a Slack sign in in progress. */
    slackState: string;
    csrfSecret: string;
  }
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Server-side sessions. The cookie only holds a signed session id. With a
 * `store` the session data is encrypted before it is stored, so the user's
 * GitHub token is never at rest in plain text. Without one sessions live in
 * memory, which is only suitable for development and tests.
 */
export function sessions(opts: {
  secret: string;
  production: boolean;
  store?: Store;
}): Handler {
  return session({
    name: "deliverybot.sid",
    secret: opts.secret,
    store: opts.store && new EncryptedStore(opts.store, opts.secret),
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: DAY,
      httpOnly: true,
      sameSite: "lax",
      secure: opts.production,
    },
  });
}

/**
 * Wraps a session store and encrypts session data with AES-256-GCM. The
 * cookie settings stay readable because stores use them for expiry.
 */
export class EncryptedStore extends Store {
  private key: Buffer;

  constructor(
    private inner: Store,
    secret: string,
  ) {
    super();
    this.key = crypto.createHash("sha256").update(`session:${secret}`).digest();
  }

  get(sid: string, cb: (err: any, session?: SessionData | null) => void) {
    this.inner.get(sid, (err, data: any) => {
      if (err || !data) return cb(err, data);
      try {
        cb(null, { ...this.open(data.sealed), cookie: data.cookie } as any);
      } catch (error) {
        // Unreadable, for example after the secret changed: start over.
        cb(null, null);
      }
    });
  }

  set(sid: string, sess: SessionData, cb?: (err?: any) => void) {
    const { cookie, ...data } = sess;
    this.inner.set(sid, { cookie, sealed: this.seal(data) } as any, cb);
  }

  destroy(sid: string, cb?: (err?: any) => void) {
    this.inner.destroy(sid, cb);
  }

  touch(sid: string, sess: SessionData, cb?: () => void) {
    if (!this.inner.touch) return cb && cb();
    this.inner.touch(sid, { cookie: sess.cookie } as any, cb);
  }

  private seal(data: object): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    const body = Buffer.concat([
      cipher.update(JSON.stringify(data), "utf8"),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
  }

  private open(sealed: string): object {
    const buf = Buffer.from(sealed, "base64");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      this.key,
      buf.subarray(0, 12),
    );
    decipher.setAuthTag(buf.subarray(12, 28));
    const body = Buffer.concat([
      decipher.update(buf.subarray(28)),
      decipher.final(),
    ]);
    return JSON.parse(body.toString("utf8"));
  }
}

/** Forgets the signed in user but keeps the rest of the session. */
export function signOut(req: Request) {
  delete req.session.token;
  delete req.session.refreshToken;
  delete req.session.tokenExpiresAt;
  delete req.session.userId;
  delete req.session.login;
  delete req.session.avatar;
  delete req.session.verified;
}

const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

/**
 * CSRF protection with a per-session token (the synchronizer token
 * pattern). Adds `req.csrfToken()` for forms and rejects unsafe requests
 * whose `_csrf` field or `csrf-token` header doesn't match.
 */
export function csrf(): Handler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session) {
      return next(new Error("csrf requires sessions"));
    }
    req.csrfToken = () => {
      if (!req.session.csrfSecret) {
        req.session.csrfSecret = crypto.randomBytes(32).toString("base64url");
      }
      return req.session.csrfSecret;
    };
    if (SAFE_METHODS.includes(req.method)) {
      return next();
    }
    const expected = req.session.csrfSecret;
    const given = Buffer.from(
      String(
        (req.body && req.body._csrf) ||
          req.get("csrf-token") ||
          req.get("x-csrf-token") ||
          "",
      ),
    );
    if (
      !expected ||
      given.length !== Buffer.byteLength(expected) ||
      !crypto.timingSafeEqual(given, Buffer.from(expected))
    ) {
      const err: any = new Error("invalid csrf token");
      err.status = 403;
      err.code = "EBADCSRFTOKEN";
      return next(err);
    }
    next();
  };
}
