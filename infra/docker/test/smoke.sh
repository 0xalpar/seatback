#!/usr/bin/env bash
set -euo pipefail
: "${DOCKER_FIXTURE_DIR:?Set disposable fixture directory outside checkout}"
compose=(docker compose --env-file "$DOCKER_FIXTURE_DIR/compose.env" -f compose.yaml -f infra/docker/test/compose.test.yaml)
"${compose[@]}" config --quiet
"${compose[@]}" build
"${compose[@]}" up -d --wait --wait-timeout 180
curl --fail --silent http://localhost:5173/ | grep -q '<div id="root"'
curl --fail --silent http://localhost:5173/participant/history | grep -q '<div id="root"'
curl --fail --silent http://localhost:5173/frontend-health | grep -q ok
curl --fail --silent http://localhost:5173/health | grep -q '"mode":"backend"'
curl --fail --silent http://localhost:5173/v1/events | grep -q '"items":\[\]'
if command -v google-chrome >/dev/null 2>&1; then
  google-chrome --headless --no-sandbox --disable-gpu --disable-dev-shm-usage \
    --virtual-time-budget=5000 --dump-dom http://localhost:5173/events \
    > "$DOCKER_FIXTURE_DIR/browser.html" 2> "$DOCKER_FIXTURE_DIR/browser.log"
  if ! grep -q 'Plans worth' "$DOCKER_FIXTURE_DIR/browser.html"; then
    cat "$DOCKER_FIXTURE_DIR/browser.log"
    head -c 12000 "$DOCKER_FIXTURE_DIR/browser.html"
    exit 1
  fi
  echo 'Integrated React application rendered in headless Chrome.'
else
  echo 'Headless Chrome unavailable; HTTP serving checks only.'
fi
"${compose[@]}" exec -T api node infra/docker/healthcheck.mjs api
"${compose[@]}" exec -T worker node infra/docker/healthcheck.mjs worker
test "$("${compose[@]}" exec -T db psql -U seatback -d seatback -Atc 'SELECT count(*) FROM seatback_migrations')" = 2
"${compose[@]}" run --rm migrate
test "$("${compose[@]}" exec -T db psql -U seatback -d seatback -Atc 'SELECT count(*) FROM seatback_migrations')" = 2
"${compose[@]}" exec -T api node --input-type=module -e 'import {access,writeFile} from "node:fs/promises";await access("/run/secrets/gate-keypair");try{await writeFile("/run/secrets/gate-keypair","changed");process.exit(1)}catch(e){if(!["EROFS","EACCES"].includes(e.code))throw e}'
if "${compose[@]}" run --rm -e SOLANA_CLUSTER=mainnet api; then echo 'Mainnet cluster unexpectedly accepted'; exit 1; fi
if "${compose[@]}" run --rm -e SOLANA_RPC_URL=https://rpc:8899/mainnet api; then echo 'Mainnet genesis unexpectedly accepted'; exit 1; fi
# PostgreSQL stays unpublished; browser reaches API only through Nginx.
test -z "$("${compose[@]}" port db 5432 2>/dev/null || true)"
"${compose[@]}" restart api
"${compose[@]}" up -d --wait --wait-timeout 180
curl --fail --silent http://localhost:5173/v1/events | grep -q '"items":\[\]'
echo 'Docker smoke checks passed with a synthetic genesis-only RPC; no on-chain deployment tested.'
