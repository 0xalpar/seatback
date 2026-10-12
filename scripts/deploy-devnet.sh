#!/usr/bin/env bash
set -euo pipefail
# Run explicitly by the local operator. No funding, key generation or signing runs in CI.
: "${SEATBACK_DEVNET_KEYS:?Set an existing private key directory outside Git}"
: "${SEATBACK_APPROVE_DEVNET_DEPLOY:?Set to yes only when authorizing Devnet signing}"
test "$SEATBACK_APPROVE_DEVNET_DEPLOY" = yes
cd "$(dirname "$0")/.."
test "$(git branch --show-current)" = release/mvp
node scripts/check-program-id.mjs --environment
keys="$(realpath "$SEATBACK_DEVNET_KEYS")"
root="$(pwd -P)"
case "$keys/" in "$root/"*) echo 'Key directory must be outside Git' >&2; exit 1;; esac
program_key="$keys/program-keypair.json"
wallet="$keys/deployer-keypair.json"
buffer="$keys/buffer-keypair.json"
test -f "$program_key" && test -f "$wallet" && test -f "$buffer"
for key in "$program_key" "$wallet" "$buffer"; do
 case "$(realpath "$key")" in "$root/"*) echo 'Private key resolves inside Git' >&2; exit 1;; esac
 permissions="$(stat -c %a "$key")"
 test "$((8#$permissions & 077))" = 0 || { echo 'Private key permissions must exclude group/other access' >&2; exit 1; }
done
program="$(node -p 'JSON.parse(require("fs").readFileSync("deployment/devnet.json")).programId')"
authority="$(node -p 'JSON.parse(require("fs").readFileSync("deployment/devnet.json")).upgradeAuthority')"
test "$(solana-keygen pubkey "$program_key")" = "$program"
test "$(solana-keygen pubkey "$wallet")" = "$authority"
# Fixed external endpoint: never consume global Solana config, a cluster override or Mainnet.
rpc=https://api.devnet.solana.com
test "$(solana --url "$rpc" genesis-hash)" = EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG
test -f target/deploy/seatback.so
test -f target/deploy/seatback.so.sha256
sha256sum --check target/deploy/seatback.so.sha256
node scripts/deployment-build.mjs check
echo 'Confirm the rent estimate and faucet-only balance documented in docs/devnet-deployment.md before signing.'
solana --url "$rpc" --keypair "$wallet" balance
# Explicit buffer key avoids the CLI generating/printing a recovery seed on upload failure.
# No --final, authority transfer, fee-check bypass or implicit IDL publication.
solana --url "$rpc" --keypair "$wallet" --commitment finalized program deploy \
 target/deploy/seatback.so --program-id "$program_key" --buffer "$buffer" \
 --upgrade-authority "$wallet" --max-len "$(stat -c %s target/deploy/seatback.so)" \
 --with-compute-unit-price 0 --max-sign-attempts 2 --use-rpc
node scripts/verify-devnet.mjs target/deploy/seatback.so
