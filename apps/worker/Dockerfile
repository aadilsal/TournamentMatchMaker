FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS development
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile
COPY packages/shared ./packages/shared
COPY apps/worker ./apps/worker
RUN pnpm --filter @vr-tournament/shared build
CMD ["pnpm", "--filter", "@vr-tournament/worker", "dev"]

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker ./apps/worker
COPY packages/shared ./packages/shared
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @vr-tournament/shared build
RUN pnpm --filter @vr-tournament/worker build

FROM node:22-alpine AS production
WORKDIR /app
COPY --from=build /app/apps/worker/dist ./dist
COPY --from=build /app/apps/worker/package.json ./
COPY --from=build /app/node_modules ./node_modules
CMD ["node", "dist/index.js"]
