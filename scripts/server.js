const fs = require("fs");
const path = require("path");

require("dotenv").config();

const prefix = path.resolve(__dirname, "..", "packages");
const state = {
  server: null,
  sockets: [],
};

function proxy() {
  const SmeeClient = require("smee-client");
  const smee = new SmeeClient({
    source: process.env.WEBHOOK_PROXY_URL,
    target: `http://0.0.0.0:3000`
  });
  smee.start();
}

function start() {
  state.server = require('@deliverybot/run').express.listen(3000, () => {
    console.log('Listening on 3000');
  });
  state.server.on('connection', (socket) => {
    state.sockets.push(socket);
  });
}

function stop(cb) {
  state.sockets.forEach((socket) => {
    if (!socket.destroyed) socket.destroy();
  });
  state.sockets = [];
  state.server.close(() => {
    cb();
  });
}

function clearCache() {
  Object.keys(require.cache).forEach((id) => {
    if (id.startsWith(prefix)) {
      delete require.cache[id];
    }
  });
}

function shutdown() {
  ["SIGINT", "SIGTERM", "SIGQUIT"].forEach(sig =>
    process.on(sig, () => stop(() => process.exit(0)))
  );
}

function restart() {
  console.log("Restarting");
  stop(() => {
    clearCache();
    start();
  });
}

fs.watchFile("tmp/restart.txt", () => {
  restart();
});

start();
proxy();
shutdown();
