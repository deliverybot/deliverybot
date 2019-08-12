// File listed at root to wire up google cloud functions.
const appFn = require('./lib')
const { createProbot } = require('probot')
const { findPrivateKey } = require('probot/lib/private-key')
const { LoggingBunyan } = require('@google-cloud/logging-bunyan');

const probot = createProbot({
  id: process.env.APP_ID,
  secret: process.env.WEBHOOK_SECRET,
  cert: findPrivateKey(),
});
probot.load(appFn);

// Write logs to stackdriver logging from bunyan logs.
probot.logger.addStream(
  new LoggingBunyan().stream(process.env.LOG_LEVEL || 'info'),
)

module.exports.deliverybot = probot.server;
