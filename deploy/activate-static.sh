#!/usr/bin/env bash
# Runs on the server (uploaded by scripts/Deploy-Grindstone.ps1): unpacks a release and switches to it,
# going back to the previous release when the health check fails.
set -euo pipefail
release="${1:-}"
[[ "$release" =~ ^[0-9]{14}-[a-f0-9]{12}$ ]] || { echo 'Invalid release'; exit 1; }
root=/srv/grindstone
url=https://grindstone.dkiessling.de/
previous="$(readlink "$root/current" || true)"
target="$root/releases/$release"
[[ ! -e "$target" ]] || { echo 'Release exists'; exit 1; }
install -d -m 755 "$target"
tar -xzf "/tmp/grindstone-$release.tar.gz" -C "$target"
rm -f "/tmp/grindstone-$release.tar.gz"
find "$target" -type d -exec chmod 755 {} +
find "$target" -type f -exec chmod 644 {} +
ln -sfn "$target" "$root/current-next"
mv -Tf "$root/current-next" "$root/current"
if ! curl --fail --silent --show-error --max-time 20 "$url" -o /dev/null \
  || ! curl --fail --silent --show-error --max-time 20 "${url}git/01-first-commit" -o /dev/null; then
  if [[ -n "$previous" ]]; then
    ln -sfn "$previous" "$root/current-next"
    mv -Tf "$root/current-next" "$root/current"
    echo 'Health check failed; restored previous release'
  else
    echo 'Health check failed; there is no previous release'
  fi
  exit 1
fi
# keep the newest 5 releases
ls -1dt "$root"/releases/* | tail -n +6 | xargs -r rm -rf
printf 'Published %s at %s\n' "$release" "$url"
