#!/usr/bin/env bash
# Install a pinned, checksum-verified Bun binary.
#
# The version, checksum, and release asset come from scripts/tools/bun.env, so
# Renovate can bump them without touching this script or the CI workflow.
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
env_file="$script_dir/tools/bun.env"
# shellcheck source=lib/download.sh
. "$script_dir/lib/download.sh"
# shellcheck source=lib/env.sh
. "$script_dir/lib/env.sh"

env_file_validate "$env_file"
env_file_require "$env_file" BUN_TAG BUN_SHA256 BUN_REPO BUN_ASSET

BUN_TAG="$(env_file_get "$env_file" BUN_TAG)"
BUN_SHA256="$(env_file_get "$env_file" BUN_SHA256)"
BUN_REPO="$(env_file_get "$env_file" BUN_REPO)"
BUN_ASSET="$(env_file_get "$env_file" BUN_ASSET)"
bun_version="${BUN_TAG#bun-v}"

dest_dir="/usr/local/bin"

usage() {
  cat <<'EOF'
Usage: install-bun.sh [--dest DIR]

Installs the pinned Bun release into DIR (default: /usr/local/bin).
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dest)
      [ "$#" -ge 2 ] || { echo "install-bun.sh: --dest requires a value" >&2; exit 2; }
      dest_dir="$2"
      shift 2
      ;;
    --dest=*)
      dest_dir="${1#*=}"
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "install-bun.sh: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! command -v unzip >/dev/null 2>&1; then
  echo "install-bun.sh: unzip is required" >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

archive="$tmp_dir/bun.zip"
url="https://github.com/${BUN_REPO}/releases/download/${BUN_TAG}/${BUN_ASSET}"
binary_dir="${BUN_ASSET%.zip}"

download_and_verify "$url" "$BUN_SHA256" "$archive"

mkdir -p "$dest_dir"
unzip -p "$archive" "${binary_dir}/bun" | install -m 755 /dev/stdin "${dest_dir}/bun"

actual="$("${dest_dir}/bun" --version | head -n1)"
actual="${actual%%+*}"
if [ "$actual" != "$bun_version" ]; then
  echo "install-bun.sh: version mismatch: got '$actual', expected '$bun_version'" >&2
  exit 1
fi

echo "bun ${actual} installed to ${dest_dir}/bun"
