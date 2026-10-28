# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c

ENV NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        iproute2 \
        mawk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN mkdir -p /config \
    && chown node:node /config

COPY package.json pnpm-lock.yaml ./

RUN corepack enable \
    && pnpm install --prod --frozen-lockfile --ignore-scripts

COPY --chown=node:node src ./src

ARG APP_VERSION=0.0.0+unknown
ARG APP_REVISION=unknown
ENV APP_VERSION=${APP_VERSION} APP_REVISION=${APP_REVISION}
LABEL org.opencontainers.image.version="${APP_VERSION}" org.opencontainers.image.revision="${APP_REVISION}"

RUN node -e "const fs=require('node:fs'); const p=JSON.parse(fs.readFileSync('package.json','utf8')); p.version=process.env.APP_VERSION; fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\\n');"

USER node

ENTRYPOINT ["node", "src/index.js"]
CMD ["--config", "/config/config.yaml"]
