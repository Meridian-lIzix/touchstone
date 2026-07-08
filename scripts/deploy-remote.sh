#!/usr/bin/env bash
set -euo pipefail

APP_ROOT=/opt/touchstone
NODE_BIN=/opt/node-v24.17.0/bin/node
RELEASE_ID="${RELEASE_ID:?}"
PACKAGE_PATH="${PACKAGE_PATH:?}"

case "$RELEASE_ID" in
  *[!a-fA-F0-9]*|"")
    echo "Invalid release id"
    exit 2
    ;;
esac

case "$PACKAGE_PATH" in
  "$APP_ROOT"/incoming/*.tgz) ;;
  *)
    echo "Invalid package path"
    exit 2
    ;;
esac

test -x "$NODE_BIN"
test -f "$PACKAGE_PATH"

mkdir -p "$APP_ROOT/releases" "$APP_ROOT/shared/media" "$APP_ROOT/shared/uploads"
release_dir="$APP_ROOT/releases/$RELEASE_ID"
if [ ! -d "$release_dir" ]; then
  tmp_dir="$(mktemp -d "$APP_ROOT/releases/.tmp-$RELEASE_ID-XXXXXX")"
  tar -xzf "$PACKAGE_PATH" -C "$tmp_dir"
  ln -sfn "$APP_ROOT/shared/arena.db" "$tmp_dir/server/arena.db"
  ln -sfn "$APP_ROOT/shared/media" "$tmp_dir/server/media"
  ln -sfn "$APP_ROOT/shared/admin.db" "$tmp_dir/admin/admin.db"
  ln -sfn "$APP_ROOT/shared/uploads" "$tmp_dir/admin/uploads"
  test -d "$tmp_dir/dist"
  test -d "$tmp_dir/node_modules"
  "$NODE_BIN" --check "$tmp_dir/server/web.mjs"
  "$NODE_BIN" --check "$tmp_dir/server/index.mjs"
  "$NODE_BIN" --check "$tmp_dir/admin/index.mjs"
  mv "$tmp_dir" "$release_dir"
fi
ln -sfn "$release_dir" "$APP_ROOT/current"
systemctl try-restart touchstone-web.service
systemctl restart touchstone-api.service
systemctl try-restart touchstone-admin.service
