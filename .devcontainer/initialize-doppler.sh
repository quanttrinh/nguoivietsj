#!/usr/bin/env sh
# Runs on the host before the devcontainer is created. Exports the host Doppler
# login and the project/config declared in the repository's doppler.yaml, either
# from a DOPPLER_TOKEN secret or from `doppler login` on the host.
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(dirname -- "$script_dir")
config_file="$repo_root/doppler.yaml"
output="${HOME}/.doppler/devcontainer.env"

mkdir -p "$(dirname "$output")"
: > "$output"

yaml_value() {
  sed -n \
    -e "s/^[[:space:]]*$1:[[:space:]]*//p" \
    -e "s/^[[:space:]]*-[[:space:]]*$1:[[:space:]]*//p" \
    "$config_file" | head -n 1 | tr -d "\"'"
}

project=""
config=""

if [ -f "$config_file" ]; then
  project=$(yaml_value "project")
  config=$(yaml_value "config")
fi

if command -v doppler >/dev/null 2>&1; then
  # Use the login scoped to this repository, as recommended for multiple
  # workplaces. Falls back to the repository's doppler.yaml values.
  scoped_project="$(doppler --scope "$repo_root" configure get project --plain 2>/dev/null || true)"
  scoped_config="$(doppler --scope "$repo_root" configure get config --plain 2>/dev/null || true)"
  token="$(doppler --scope "$repo_root" configure get token --plain 2>/dev/null || true)"

  if [ -n "$scoped_project" ]; then
    project="$scoped_project"
  fi

  if [ -n "$scoped_config" ]; then
    config="$scoped_config"
  fi

  if [ -n "$token" ]; then
    printf 'DOPPLER_TOKEN=%s\n' "$token" >> "$output"
  fi
fi

if [ -n "$project" ]; then
  printf 'DOPPLER_PROJECT=%s\n' "$project" >> "$output"
fi

if [ -n "$config" ]; then
  printf 'DOPPLER_CONFIG=%s\n' "$config" >> "$output"
fi

chmod 600 "$output"
