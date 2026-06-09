FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

FROM deps AS development
COPY . .
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["pnpm", "dev"]

FROM deps AS build
COPY . .
RUN pnpm --filter @vr-tournament/shared build
RUN pnpm --filter @vr-tournament/api build

FROM node:22-alpine AS production
WORKDIR /app
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/index.js"]
