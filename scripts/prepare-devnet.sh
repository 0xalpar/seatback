#!/usr/bin/env bash
set -euo pipefail
: "${SEATBACK_DEVNET_KEYS:?Set your local existing key directory outside Git}"
cd "$(dirname "$0")/.."
test "$(git branch --show-current)" = release/mvp
keys="$(realpath "$SEATBACK_DEVNET_KEYS")"
case "$keys/" in "$(pwd -P)/"*) echo 'Keys must remain outside Git' >&2; exit 1;; esac
rustc --version | grep -F 'rustc 1.89.0 '
solana --version | grep -F '2.3.13'
anchor --version | grep -F '0.32.1'
program="$(solana-keygen pubkey "$keys/program-keypair.json")"
authority="$(solana-keygen pubkey "$keys/deployer-keypair.json")"
node scripts/configure-devnet.mjs "$program" "$authority"
RUSTC_BOOTSTRAP=1 RUSTUP_TOOLCHAIN=1.89.0 cargo run --locked -p seatback-idl-gen
node scripts/check-program-id.mjs
cargo build-sbf --manifest-path programs/seatback/Cargo.toml --tools-version v1.56 --arch v0 -- --locked
SBF_OUT_DIR="$PWD/target/deploy" cargo test --locked -p seatback -p seatback-chain-tests -- --nocapture
pnpm check:foundation
pnpm check
node scripts/deployment-build.mjs record
sha256sum target/deploy/seatback.so > target/deploy/seatback.so.sha256
echo 'Prepared and tested only. No wallet funding, signing or deployment has occurred.'
