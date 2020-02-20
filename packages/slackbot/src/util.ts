import { Request } from "express";
import crypto from "crypto";

export function verifySignature(secret: string, req: Request) {
  const log = (req as any).log;
  try {
    const signature = req.headers["x-slack-signature"];
    const timestamp = req.headers["x-slack-request-timestamp"];
    if (!signature || Array.isArray(signature)) {
      log.info({ signature }, "verifySignature: invalid header");
      return false;
    }
    if (!timestamp || Array.isArray(timestamp)) {
      log.info({ timestamp }, "verifySignature: invalid header");
      return false;
    }

    const [version, hashed] = signature.split("=");

    // Check if the timestamp is too old
    const fiveMinutesAgo = ~~(Date.now() / 1000) - 60 * 5;
    if (parseInt(timestamp, 10) < fiveMinutesAgo) {
      log.info({ timestamp }, "verifySignature: timestamp too old");
      return false;
    }

    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(`${version}:${timestamp}:${req.rawBody}`);

    // Timing safe comparison.
    const tssc = (a: string, b: string) => {
      const ab = new Buffer(a, "utf-8");
      const bb = new Buffer(b, "utf-8");
      if (ab.length !== bb.length) {
        return false;
      }
      return crypto.timingSafeEqual(ab, bb);
    };

    const calculated = hmac.digest("hex").toString();
    if (!tssc(calculated, hashed)) {
      log.info({ calculated, hashed }, "verifySignature: invalid signature");
      return false;
    }
    return true;
  } catch (err) {
    log.error({ err }, "verifySignature: error");
    return false;
  }
}
