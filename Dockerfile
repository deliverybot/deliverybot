FROM node:lts-alpine
RUN apk add --no-cache ca-certificates
WORKDIR /usr/src/app
COPY dist /usr/src/app
ENV NODE_ENV=production PATH="/usr/src/app/node_modules/.bin/:${PATH}" PORT=8080
ENTRYPOINT ["/usr/src/app/entrypoint.sh"]
CMD ["probot", "run", "lib/index.js"]
