#!/usr/bin/env bash
# Shared helpers for verified downloads.
#
# This file is meant to be sourced, not executed:
#   . "$(dirname "$0")/lib/download.sh"

# download_and_verify <url> <checksum> <output>
#
# Downloads <url> to <output> and fails unless the file matches the expected
# checksum. Two forms are accepted:
#
#   <64 hex chars>      SHA-256, as published in GitHub release asset digests
#   sha512-<base64>     SRI integrity, as published by the npm registry
#
# The checksum is always required: every caller must pin one.
download_and_verify() {
  local url="$1"
  local expected="$2"
  local output="$3"

  if ! [[ "$expected" =~ ^([0-9a-fA-F]{64}|sha512-[A-Za-z0-9+/=]+)$ ]]; then
    echo "download_and_verify: missing or malformed checksum for $url" >&2
    return 1
  fi

  if ! command -v curl >/dev/null 2>&1; then
    echo "download_and_verify: curl is required" >&2
    return 1
  fi

  curl --proto '=https' --tlsv1.2 --retry 3 --retry-delay 2 -fsSL \
    -o "$output" "$url" || {
    echo "download_and_verify: failed to download $url" >&2
    return 1
  }

  if [[ "$expected" == sha512-* ]]; then
    _verify_sha512_integrity "$expected" "$output" || {
      echo "download_and_verify: checksum mismatch for $url" >&2
      return 1
    }
  else
    printf '%s  %s\n' "$expected" "$output" | sha256sum --check --strict --quiet || {
      echo "download_and_verify: checksum mismatch for $url" >&2
      return 1
    }
  fi
}

# Internal: convert an SRI sha512 digest to hex so sha512sum can check it.
_verify_sha512_integrity() {
  local integrity="$1"
  local output="$2"
  local base64_digest="${integrity#sha512-}"
  local hex_digest

  if ! command -v sha512sum >/dev/null 2>&1; then
    echo "download_and_verify: sha512sum is required" >&2
    return 1
  fi

  hex_digest="$(printf '%s' "$base64_digest" | base64 -d 2>/dev/null | od -An -tx1 | tr -d ' \n')" || return 1
  if ! [[ "$hex_digest" =~ ^[0-9a-f]{128}$ ]]; then
    echo "download_and_verify: malformed sha512 integrity: $integrity" >&2
    return 1
  fi

  printf '%s  %s\n' "$hex_digest" "$output" | sha512sum --check --strict --quiet
}
