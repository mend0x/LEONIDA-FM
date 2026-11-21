#!/bin/sh
set -eu
if [ -n "${ADMIN_TOKEN_FILE:-}" ]; then
  if [ ! -r "$ADMIN_TOKEN_FILE" ]; then
    echo 'Cannot read the configured administrator secret file.' >&2
    exit 1
  fi
  ADMIN_TOKEN="$(cat "$ADMIN_TOKEN_FILE")"
  if [ "${#ADMIN_TOKEN}" -lt 32 ] || [ "${#ADMIN_TOKEN}" -gt 512 ]; then
    echo 'Administrator secret must contain between 32 and 512 characters.' >&2
    exit 1
  fi
  export ADMIN_TOKEN
fi
umask 077
exec "$@"
