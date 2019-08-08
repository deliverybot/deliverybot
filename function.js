// File listed at root to wire up google cloud functions.
const appFn = require('./lib')
const { createProbot } = require('probot')
const { findPrivateKey } = require('probot/lib/private-key')

const probot = createProbot({
  id: process.env.APP_ID,
  secret: process.env.WEBHOOK_SECRET,
  cert: findPrivateKey(),
});
probot.load(appFn);

module.exports.deliverybot = probot.server;
