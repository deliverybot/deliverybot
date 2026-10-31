# One image runs the web server, the queue worker and migrations:
#   web:     node packages/run/lib/server.js (default)
#   worker:  node packages/run/lib/worker.js
#   migrate: node packages/postgres/lib/cli.js

FROM node:22.23.4-bookworm-slim AS base
WORKDIR /app

# Only the package manifests, so the dependency layers below stay cached until
# a dependency changes instead of being reinstalled for every code change.
FROM base AS manifests
COPY package.json yarn.lock ./
COPY packages/app/package.json packages/app/
COPY packages/client/package.json packages/client/
COPY packages/core/package.json packages/core/
COPY packages/deploybot/package.json packages/deploybot/
COPY packages/postgres/package.json packages/postgres/
COPY packages/run/package.json packages/run/
COPY packages/slackbot/package.json packages/slackbot/

FROM manifests AS deps
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn,sharing=locked \
  yarn install --frozen-lockfile --network-timeout 600000

FROM manifests AS production-deps
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn,sharing=locked \
  yarn install --frozen-lockfile --production --ignore-scripts --network-timeout 600000

FROM deps AS build
COPY . .
RUN yarn build \
  && rm -rf node_modules packages/*/node_modules \
  && find packages -mindepth 2 -maxdepth 2 \( -name src -o -name test \) -prune -exec rm -rf {} +

FROM base
ENV NODE_ENV=production
COPY --from=production-deps --chown=node:node /app /app
COPY --from=build --chown=node:node /app /app
# Numeric so Kubernetes can verify runAsNonRoot. 1000 is the `node` user.
USER 1000:1000
# Shown in the app header. Declared last so it doesn't bust the build cache.
ARG COMMIT_SHA=""
ENV COMMIT_SHA=$COMMIT_SHA
EXPOSE 3000
CMD ["node", "packages/run/lib/server.js"]
