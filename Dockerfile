FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@10.15.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/core/package.json ./packages/core/
RUN pnpm install --frozen-lockfile
COPY apps ./apps
COPY packages ./packages
RUN pnpm build:web

FROM node:24-bookworm-slim AS api
WORKDIR /app
COPY --from=build /app/apps/api/dist ./dist
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3002 CALOS_DATA_DIR=/data
USER node
EXPOSE 3002
CMD ["node", "dist/start.js"]

FROM scratch AS web
COPY --from=build /app/apps/web/dist /

FROM build AS e2e
RUN pnpm --filter @calos/web exec playwright install --with-deps chromium
CMD ["pnpm", "--filter", "@calos/web", "test:e2e"]
