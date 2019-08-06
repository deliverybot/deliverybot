FROM alpine/helm:2.14.0
ENV BUILDER=helm VERSION=2.14.0.0
RUN apk add --no-cache jq curl bash && helm init --client-only
COPY entrypoint.sh helm/deploy.sh helm/remove.sh helm/charts /
ENTRYPOINT ["/entrypoint.sh"]
