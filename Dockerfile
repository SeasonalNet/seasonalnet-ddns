# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim

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

USER node

ENTRYPOINT ["node", "src/index.js"]
CMD ["--config", "/config/config.yaml"]
