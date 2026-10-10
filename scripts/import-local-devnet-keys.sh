#!/usr/bin/env bash
set -euo pipefail
# Local Windows -> local WSL transfer only. Never prints key contents or overwrites a key.
: "${WINDOWS_SEATBACK_KEYS:?Set the existing local Windows key directory as a /mnt/c path}"
destination="$HOME/.config/seatback/devnet"
umask 077
install -d -m 700 "$destination"
for role in program deployer buffer; do
 source="$WINDOWS_SEATBACK_KEYS/$role-keypair.json"
 target="$destination/$role-keypair.json"
 test -f "$source"
 if test -e "$target"; then
  cmp --silent "$source" "$target" || { echo "Existing $role identity differs; preserved" >&2; exit 1; }
 else install -m 600 "$source" "$target"; fi
done
echo 'Existing local identities copied/reused in private WSL storage; no keys generated or displayed.'
