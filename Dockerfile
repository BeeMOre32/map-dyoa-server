# syntax=docker/dockerfile:1

# Fly.io + Bun: https://hub.docker.com/r/oven/bun
FROM oven/bun:1-slim

RUN apt-get update -qq \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
# fly.toml internal_port 와 맞춤 (Fly 가 PORT 주입)
ENV PORT=3000

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY . .

EXPOSE 3000

# package.json 의 "start": "bun run src/index.ts"
CMD ["bun", "run", "src/index.ts"]
