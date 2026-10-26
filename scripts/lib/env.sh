#!/usr/bin/env bash
# Helpers for reading tool pin files without sourcing them.
#
# Pin files may come from a pull request, so they are treated as data: values
# are read with sed and validated, never evaluated by the shell.

# env_file_validate <file>
#
# Accepts comment/blank lines and strict KEY=value lines whose values contain
# only characters that appear in release versions, checksums, and asset names.
env_file_validate() {
  local file="$1"
  local line

  [ -f "$file" ] || {
    echo "env_file_validate: missing file: $file" >&2
    return 1
  }

  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      '' | '#'*) continue ;;
    esac
    if ! [[ "$line" =~ ^[A-Z][A-Z0-9_]*=[A-Za-z0-9._:/+=@-]+$ ]]; then
      echo "env_file_validate: invalid line in $file: $line" >&2
      return 1
    fi
  done <"$file"
}

# env_file_get <file> <KEY>
env_file_get() {
  local file="$1"
  local key="$2"

  sed -n "s/^${key}=//p" "$file" | head -n1
}

# env_file_require <file> <KEY>...
#
# Fails unless every key is present with a non-empty value.
env_file_require() {
  local file="$1"
  shift
  local key

  for key in "$@"; do
    if [ -z "$(env_file_get "$file" "$key")" ]; then
      echo "env_file_require: missing $key in $file" >&2
      return 1
    fi
  done
}
