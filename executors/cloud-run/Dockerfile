FROM google/cloud-sdk:256.0.0-alpine
ENV BUILDER=cloud-run VERSION=256.0.0.0
RUN apk add --no-cache jq curl && gcloud components install beta
COPY entrypoint.sh cloud-run/deploy.sh cloud-run/remove.sh /
ENTRYPOINT ["/entrypoint.sh"]
