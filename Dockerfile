# One image runs the web server, the queue worker and migrations:
#   web:     node packages/run/lib/server.js (default)
#   worker:  node packages/run/lib/worker.js
#   migrate: node packages/postgres/lib/cli.js

FROM node:22.23.3-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN yarn install --frozen-lockfile --network-timeout 600000 \
  && yarn build \
  && yarn install --frozen-lockfile --production --ignore-scripts --network-timeout 600000 \
  && yarn cache clean \
  && find packages -mindepth 2 -maxdepth 2 \( -name src -o -name test \) -prune -exec rm -rf {} +

FROM node:22.23.3-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
# Numeric so Kubernetes can verify runAsNonRoot. 1000 is the `node` user.
USER 1000:1000
# Shown in the app header. Declared last so it doesn't bust the build cache.
ARG COMMIT_SHA=""
ENV COMMIT_SHA=$COMMIT_SHA
EXPOSE 3000
CMD ["node", "packages/run/lib/server.js"]
