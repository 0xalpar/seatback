# syntax=docker/dockerfile:1
FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/chain-client/package.json packages/chain-client/package.json
RUN --mount=type=cache,id=seatback-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store
COPY packages packages
COPY apps/web apps/web
# Public configuration only. Empty API base means the browser's current origin.
# Both spellings support the foundation example and Developer 2's current frontend.
ARG VITE_API_BASE=""
ARG VITE_API_BASE_URL=""
ARG VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
ARG VITE_SEATBACK_PROGRAM_ID=""
ENV VITE_API_BASE=$VITE_API_BASE VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_SOLANA_CLUSTER=devnet VITE_SOLANA_RPC_URL=$VITE_SOLANA_RPC_URL \
    VITE_SEATBACK_PROGRAM_ID=$VITE_SEATBACK_PROGRAM_ID VITE_DEMO_MODE=false
RUN pnpm --filter @seatback/contracts build && pnpm --filter @seatback/web build

FROM nginx:1.28-alpine AS frontend
COPY infra/docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=4 CMD wget -q -O /dev/null http://127.0.0.1:8080/frontend-health || exit 1
ENTRYPOINT ["nginx", "-g", "daemon off;"]
