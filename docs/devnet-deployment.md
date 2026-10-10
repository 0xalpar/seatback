# Task 3: local-operator Devnet deployment

## Current status and authority

With explicit operator approval, dedicated Devnet keys and application secrets were generated on
the operator's Windows computer at `C:/Users/Mustafa/.seatback/devnet`, outside Git, protected by
owner/SYSTEM directory ACLs. Existing files are reused, never overwritten. No deployment key is
generated or uploaded in CI. Program public ID: `5PZki4JDVr8Cd1DTCGCiRHNgXAnZBjAAJVc9HSrmCR97`.
This is a prepared identity, **not a verified deployment**. Faucet funding/signing need operator approval.
Anchor's default provider wallet now points to a dedicated SeatBack Devnet path, not a general wallet.
Financial Rust logic is unchanged. Compilation, test success and a configured address are not deployment.

The existing backend CI compiles Rust 1.89.0 / Anchor crate 0.32.1, regenerates compiler IDL,
builds with Agave 2.3.13 / SBF platform-tools v1.56 (`--arch v0`), and executes unit and compiled
SBF adversarial tests. Deployment keys, signing and faucet calls are never CI inputs/actions.
Anchor CLI is not used by that build; its installation/version is checked by the local preparation script.

## 1. Install the local Linux toolchain

Use [Windows/WSL setup](windows-runtime.md). For this task install Ubuntu with `wsl --install -d Ubuntu`
from Administrator PowerShell, restart if requested, and open Ubuntu. Use an ordinary Linux user.
Keep private keys in the Linux home filesystem, not `/mnt/c`, the repository, cloud sync or temporary CI.
Use your existing `release/mvp` checkout; a Linux filesystem checkout is faster for Cargo builds.
If your checkout is in Windows, its WSL path is:

```bash
cd /mnt/c/Users/Mustafa/.codex/.chatgpt-projects/g-p-6aca02a657b0819195b33bb4e7d4a76f/seatback
git switch release/mvp
git pull --ff-only
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libssl-dev libudev-dev clang cmake curl ca-certificates git bzip2 xz-utils
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o /tmp/seatback-rustup.sh
sh /tmp/seatback-rustup.sh -y --profile minimal --default-toolchain 1.89.0
source "$HOME/.cargo/env"
rustup component add rustfmt --toolchain 1.89.0
mkdir -p "$HOME/.local/share/seatback-toolchain"
curl --fail --location https://github.com/anza-xyz/agave/releases/download/v2.3.13/solana-release-x86_64-unknown-linux-gnu.tar.bz2 -o /tmp/seatback-agave.tar.bz2
tar -xjf /tmp/seatback-agave.tar.bz2 -C "$HOME/.local/share/seatback-toolchain"
export PATH="$HOME/.local/share/seatback-toolchain/solana-release/bin:$PATH"
cargo install --git https://github.com/coral-xyz/anchor --tag v0.32.1 anchor-cli --locked
rustc --version
solana --version
anchor --version
```

These pinned Agave binaries are for x86_64 WSL; ARM Windows needs a supported Linux x86_64
environment or a reviewed build for its architecture. Persist the PATH export in `~/.bashrc`.
Install Linux Node 24.19.0 and pnpm 11.25.0 (matching `.node-version` / packageManager):

```bash
mkdir -p "$HOME/.local/share/seatback-toolchain/node-download"
pushd "$HOME/.local/share/seatback-toolchain/node-download"
curl --fail --location https://nodejs.org/dist/v24.19.0/node-v24.19.0-linux-x64.tar.xz -O
curl --fail --location https://nodejs.org/dist/v24.19.0/SHASUMS256.txt -O
grep ' node-v24.19.0-linux-x64.tar.xz$' SHASUMS256.txt | sha256sum --check
tar -xJf node-v24.19.0-linux-x64.tar.xz -C "$HOME/.local/share/seatback-toolchain"
popd
export PATH="$HOME/.local/share/seatback-toolchain/node-v24.19.0-linux-x64/bin:$HOME/.local/share/seatback-toolchain/npm/bin:$PATH"
npm install --global --prefix "$HOME/.local/share/seatback-toolchain/npm" pnpm@11.25.0
node --version
pnpm --version
pnpm install --frozen-lockfile
```

Persist these PATH entries too. Do not reuse Windows `node_modules` in Linux:
prefer a separate Linux checkout/dependency install. Git authentication inside WSL may need
your own GitHub authorization; never put tokens into repository files.

## 2. Generate the local keys yourself

**This computer already has approved local keys. Do not regenerate them.** After installing Solana
CLI in WSL, copy/reuse the existing identities into its private Linux home directory:

```bash
export WINDOWS_SEATBACK_KEYS=/mnt/c/Users/Mustafa/.seatback/devnet
bash scripts/import-local-devnet-keys.sh
export SEATBACK_DEVNET_KEYS="$HOME/.config/seatback/devnet"
```

The following generation instructions apply only to a genuinely fresh machine with no prepared identity.
Creating different keys would change the configured program; do not do that for this checkout.

Run locally in WSL. These commands deliberately fail if a target key file already exists.
`--silent` suppresses seed phrase display. Keypairs remain outside Git with restrictive Linux permissions.
The buffer is explicit so Solana CLI does not generate/print a temporary buffer recovery phrase.

```bash
umask 077
export SEATBACK_DEVNET_KEYS="$HOME/.config/seatback/devnet"
install -d -m 700 "$SEATBACK_DEVNET_KEYS"
test ! -e "$SEATBACK_DEVNET_KEYS/program-keypair.json" && solana-keygen new --silent --no-bip39-passphrase --outfile "$SEATBACK_DEVNET_KEYS/program-keypair.json"
test ! -e "$SEATBACK_DEVNET_KEYS/deployer-keypair.json" && solana-keygen new --silent --no-bip39-passphrase --outfile "$SEATBACK_DEVNET_KEYS/deployer-keypair.json"
test ! -e "$SEATBACK_DEVNET_KEYS/buffer-keypair.json" && solana-keygen new --silent --no-bip39-passphrase --outfile "$SEATBACK_DEVNET_KEYS/buffer-keypair.json"
chmod 600 "$SEATBACK_DEVNET_KEYS/"*-keypair.json
solana-keygen pubkey "$SEATBACK_DEVNET_KEYS/program-keypair.json"
solana-keygen pubkey "$SEATBACK_DEVNET_KEYS/deployer-keypair.json"
```

Retain secure local backups. Do not paste private JSON or seed phrases into chat and do not enable
shell tracing (`set -x`). The deployer is the retained upgrade authority. It is not the runtime gate,
participant, organizer or independent dispute-authority wallet. No deployment wallet funding is automatic.

## 3. Configure the real public ID, compile and test

```bash
bash scripts/prepare-devnet.sh
git diff -- programs/seatback/src/lib.rs Anchor.toml packages/chain-client/idl/seatback.json .env.example infra/docker/.env.example apps/web/.env.example deployment/devnet.json
```

The script extracts **only public keys** using `solana-keygen pubkey`, sets `declare_id!`,
`[programs.devnet]`, backend/Docker/frontend public examples, and `deployment/devnet.json` with
`status: prepared-not-deployed`. It refuses to silently replace a previously prepared identity.
It regenerates the IDL with the compiler, verifies all public IDs match, builds SBF, runs Rust/SBF
and Node security tests/typechecks/production builds, and records an ignored build receipt and hash.
IDL is never handwritten. A changed source, identity, IDL or binary invalidates the deployment receipt.
If any check fails, stop; do not sign a stale binary. The script never funds or deploys.

Update your ignored runtime `.env` with this actual `SEATBACK_PROGRAM_ID`; for host-run web set
`VITE_PROGRAM_ID` identically. Legacy `VITE_SEATBACK_PROGRAM_ID`, if set, must match too.
Compose already passes both frontend aliases from `SEATBACK_PROGRAM_ID`; its API base stays same-origin.
Run `node --env-file-if-exists=.env scripts/check-program-id.mjs --environment`, and rebuild web after
changing public settings. Do not copy the deployment wallet into the gate key mount.

## 4. Estimate and obtain only the required faucet SOL

These operations must be explicitly executed by you. The fixed endpoint below is Devnet;
the full genesis must be `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG` before funding/signing.

```bash
solana --url https://api.devnet.solana.com genesis-hash
bytes=$(stat -c %s target/deploy/seatback.so)
solana --url https://api.devnet.solana.com rent "$((bytes + 45))"
solana --url https://api.devnet.solana.com rent "$((bytes + 37))"
solana --url https://api.devnet.solana.com rent 36
solana --url https://api.devnet.solana.com --keypair "$SEATBACK_DEVNET_KEYS/deployer-keypair.json" balance
```

These are ProgramData, temporary upload buffer and program-account rent requirements. Peak funding
also needs transaction fees for chunked uploads and deployment; buffer rent is reclaimed on success.
There is no fixed invented minimum SOL figure: it depends on the compiled byte count and current rent/fees.
Use the displayed rent requirements plus a small faucet-only transaction-fee allowance. The CLI's fee/balance
checks stay enabled. Never use a real-funded wallet or send Mainnet SOL. Request only the shortfall, subject
to faucet limits, for example by replacing `AMOUNT_IN_SOL` with your calculated test amount:

```bash
solana --url https://api.devnet.solana.com --keypair "$SEATBACK_DEVNET_KEYS/deployer-keypair.json" airdrop AMOUNT_IN_SOL
```

If rate-limited, use [Solana's faucet](https://faucet.solana.com/) with the **public deployer address**
or wait for its cooldown. Do not repeatedly retry or fund the program/buffer keys directly.

## 5. Authorize and sign the deployment locally

Only after reviewing the preparation checks, balance and public identity:

```bash
export SEATBACK_APPROVE_DEVNET_DEPLOY=yes
bash scripts/deploy-devnet.sh
unset SEATBACK_APPROVE_DEVNET_DEPLOY
```

The script fixes the external RPC to Devnet, checks exact genesis, local program/deployer public
keys, compiler identity and tested build receipt before invoking Solana CLI. It uses an explicit
buffer, zero priority fee and a maximum of two signing rounds. It retains the upgrade authority;
it does not revoke/transfer authority or upload an IDL account. Backend/frontend use the generated
repository IDL, so publishing IDL on-chain is not required. Interrupted upload: inspect the known
buffer with `solana --url https://api.devnet.solana.com program show PUBLIC_BUFFER_ADDRESS`; do not
generate another buffer or discard its key before deciding whether to resume the same command.

## 6. Independently verify afterward

```bash
PROGRAM_ID=$(solana-keygen pubkey "$SEATBACK_DEVNET_KEYS/program-keypair.json")
solana --url https://api.devnet.solana.com --commitment finalized account "$PROGRAM_ID" --output json
solana --url https://api.devnet.solana.com --commitment finalized program show "$PROGRAM_ID"
node scripts/verify-devnet.mjs target/deploy/seatback.so
```

The read-only verifier checks full Devnet genesis, finalized program/ProgramData accounts,
executable state, upgradeable-loader ownership, canonical ProgramData PDA, expected upgrade
authority, exact uploaded bytecode and a successful signed loader deployment transaction in the
deployment slot. It then rechecks for a concurrent upgrade and prints actual proof/signature and
a Devnet Explorer transaction link. If RPC history is insufficient, provide the actual deployment
signature: `node scripts/verify-devnet.mjs target/deploy/seatback.so ACTUAL_SIGNATURE`.
Do not treat `program show`, an Explorer page, a matching ID or CLI output alone as full verification.
RPC/account compatibility and bytecode verification do not execute financial instructions. Phantom
and live reservation/deposit/refund flows remain outside Task 3.

After successful verification, review and commit **only public changes** to `release/mvp`:
`programs/seatback/src/lib.rs`, `Anchor.toml`, compiler-generated IDL, public `.env.example` files
and `deployment/devnet.json`. Keep its preparation status separate from actual verification output;
record only the real public verification proof in documentation. Never stage `target`, `.env` or keys.
For example, after the read-only verifier succeeds:

```bash
node scripts/verify-devnet.mjs target/deploy/seatback.so > deployment/devnet-verification.json
git add programs/seatback/src/lib.rs Anchor.toml packages/chain-client/idl/seatback.json .env.example infra/docker/.env.example apps/web/.env.example deployment/devnet.json deployment/devnet-verification.json
git diff --cached --check
git diff --cached --stat
git commit -m "Configure and verify operator-deployed SeatBack program on Devnet"
git push origin release/mvp
```

Do not merge PR #5. If you want Codex to record the result, share only program ID, public authority,
transaction signature and verification output, never the wallet files.

Official references: [Solana deployment](https://solana.com/docs/programs/deploying),
[loader-v3 lifecycle](https://solana.com/docs/core/programs/program-deployment),
[Anchor 0.32.1](https://www.anchor-lang.com/docs/updates/release-notes/0-32-1).
