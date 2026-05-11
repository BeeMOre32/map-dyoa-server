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

COPY package.json package-lock.json ./
# npm lockfile 기준; 재현이 필요하면 로컬에서 `bun install` 후 bun.lockb 커밋하고 --frozen-lockfile 추가
RUN bun install --production

COPY . .

EXPOSE 3000

# package.json 의 "start": "bun run src/index.ts"
CMD ["bun", "run", "src/index.ts"]
