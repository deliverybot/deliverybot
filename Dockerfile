FROM node:10.18.1-stretch-slim as builder
COPY . /app
WORKDIR /app
RUN apt-get update \
    && apt-get install -y jq \
    && apt-get clean
RUN yarn policies set-version
RUN yarn
RUN yarn build

FROM bitnami/node:10-prod
ENV NODE_ENV="production"
COPY --from=builder /app /app
WORKDIR /app
EXPOSE 3000
CMD ["yarn", "server"]