# syntax=docker/dockerfile:1
FROM node:24.19.0-bookworm-slim AS dependencies
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/chain-client/package.json packages/chain-client/package.json

FROM dependencies AS production-dependencies
RUN pnpm install --prod --frozen-lockfile --ignore-scripts --store-dir=/pnpm/store

FROM dependencies AS build
RUN pnpm install --frozen-lockfile --store-dir=/pnpm/store
COPY apps/api apps/api
COPY apps/worker apps/worker
COPY packages packages
RUN pnpm --filter @seatback/contracts build && \
    pnpm --filter @seatback/chain-client build && \
    pnpm --filter @seatback/api build && pnpm --filter @seatback/worker build

FROM node:24.19.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Preserve pnpm's relative workspace links; only compiled code and production dependencies.
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=production-dependencies /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=production-dependencies /app/packages/chain-client/node_modules ./packages/chain-client/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /app/packages/chain-client/dist ./packages/chain-client/dist
COPY --from=build /app/packages/chain-client/package.json ./packages/chain-client/package.json
COPY --from=build /app/packages/chain-client/idl ./packages/chain-client/idl
COPY scripts/migrate.mjs ./scripts/migrate.mjs
COPY supabase/migrations ./supabase/migrations
COPY infra/docker/*.mjs ./infra/docker/
USER node
ENTRYPOINT ["node", "infra/docker/entrypoint.mjs"]

FROM runtime AS api
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=8s --start-period=30s --retries=4 CMD ["node", "infra/docker/healthcheck.mjs", "api"]
CMD ["api"]

FROM runtime AS worker
HEALTHCHECK --interval=15s --timeout=8s --start-period=30s --retries=4 CMD ["node", "infra/docker/healthcheck.mjs", "worker"]
CMD ["worker"]

FROM runtime AS migrate
CMD ["migrate"]

# Platform chooses api/worker using SEATBACK_SERVICE; Compose targets above stay unchanged.
FROM runtime AS hosted
ENTRYPOINT ["node", "infra/docker/hosted-entrypoint.mjs"]
CMD []
