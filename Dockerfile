FROM node:24-bookworm-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-bookworm-slim AS build

WORKDIR /app

ARG NFLVERSE_DEFAULT_SEASON=2025
ARG NFLVERSE_SNAPSHOT_SEASON=2025

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NFL_SOURCE=nflverse
ENV NFLVERSE_DEFAULT_SEASON=${NFLVERSE_DEFAULT_SEASON}
ENV NFLVERSE_SNAPSHOT_SEASON=${NFLVERSE_SNAPSHOT_SEASON}
ENV NFL_SQLITE_PATH=/app/data/nfl-query.sqlite
ENV NFL_LOG_TO_FILE=0
ENV NFL_QUERY_TEST_QUIET_LOGS=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build:snapshot \
  && npm run verify:snapshot \
  && npm run build \
  && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime

WORKDIR /app

ARG NFLVERSE_DEFAULT_SEASON=2025

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NFL_SOURCE=nflverse
ENV NFLVERSE_DEFAULT_SEASON=${NFLVERSE_DEFAULT_SEASON}
ENV NFL_SQLITE_PATH=/app/data/nfl-query.sqlite
ENV NFL_LOG_TO_FILE=0
ENV PORT=3000

COPY --from=build /app ./

EXPOSE 3000

CMD ["npm", "run", "start"]
