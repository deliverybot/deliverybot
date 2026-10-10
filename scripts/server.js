// Development server: runs packages/run with Node's watch mode, so it
// restarts whenever the compiled output changes, and proxies webhooks from
// smee.io when WEBHOOK_PROXY_URL is set.
const { spawn } = require("child_process");

require("dotenv").config();

if (process.env.WEBHOOK_PROXY_URL) {
  const SmeeClient = require("smee-client");
  new SmeeClient({
    source: process.env.WEBHOOK_PROXY_URL,
    target: `http://localhost:${process.env.PORT || 3000}`,
  }).start();
}

const server = spawn(
  process.execPath,
  ["--watch", "packages/run/lib/server.js"],
  { stdio: "inherit", env: process.env },
);

["SIGINT", "SIGTERM", "SIGQUIT"].forEach((sig) =>
  process.on(sig, () => {
    server.kill("SIGTERM");
    process.exit(0);
  }),
);
