#!/usr/bin/env bash
# Install a pinned, checksum-verified Node.js release (npm included).
#
# The version and per-architecture checksums come from
# scripts/tools/node.env, so a bump does not touch this script.
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
env_file="$script_dir/tools/node.env"
# shellcheck source=lib/download.sh
. "$script_dir/lib/download.sh"
# shellcheck source=lib/env.sh
. "$script_dir/lib/env.sh"

env_file_validate "$env_file"
env_file_require "$env_file" NODE_VERSION NODE_SHA256_X64 NODE_SHA256_ARM64

node_version="$(env_file_get "$env_file" NODE_VERSION)"

case "$(uname -m)" in
  x86_64 | amd64)
    arch="x64"
    checksum="$(env_file_get "$env_file" NODE_SHA256_X64)"
    ;;
  aarch64 | arm64)
    arch="arm64"
    checksum="$(env_file_get "$env_file" NODE_SHA256_ARM64)"
    ;;
  *)
    echo "install-node.sh: unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

dest_dir="/usr/local"

usage() {
  cat <<'EOF'
Usage: install-node.sh [--dest DIR]

Installs the pinned Node.js release into DIR (default: /usr/local).
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dest)
      [ "$#" -ge 2 ] || { echo "install-node.sh: --dest requires a value" >&2; exit 2; }
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
      echo "install-node.sh: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! command -v tar >/dev/null 2>&1; then
  echo "install-node.sh: tar is required" >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

archive="$tmp_dir/node.tar.gz"
asset="node-v${node_version}-linux-${arch}.tar.gz"
url="https://nodejs.org/dist/v${node_version}/${asset}"

download_and_verify "$url" "$checksum" "$archive"

mkdir -p "$dest_dir"
tar -xzf "$archive" -C "$dest_dir" --strip-components=1

actual="$(node --version)"
if [ "$actual" != "v${node_version}" ]; then
  echo "install-node.sh: version mismatch: got '$actual', expected 'v${node_version}'" >&2
  exit 1
fi

echo "node ${actual} and npm $(npm --version) installed to ${dest_dir}"
