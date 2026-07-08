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

  # 内容持久化：Markdown 与封面图落到共享卷，后台增删改查不随发布回退或丢失
  # 首次迁移优先用当前线上内容做种，其次用发布包内容；已存在则直接复用
  if [ ! -d "$APP_ROOT/shared/content" ]; then
    if [ -d "$APP_ROOT/current/src/content" ] && [ ! -L "$APP_ROOT/current/src/content" ]; then
      cp -a "$APP_ROOT/current/src/content" "$APP_ROOT/shared/content"
    else
      cp -a "$tmp_dir/src/content" "$APP_ROOT/shared/content"
    fi
  fi
  rm -rf "$tmp_dir/src/content"
  ln -sfn "$APP_ROOT/shared/content" "$tmp_dir/src/content"

  if [ ! -d "$APP_ROOT/shared/uploads-content" ]; then
    mkdir -p "$APP_ROOT/shared/uploads-content"
    if [ -d "$APP_ROOT/current/public/uploads/content" ] && [ ! -L "$APP_ROOT/current/public/uploads/content" ]; then
      cp -a "$APP_ROOT/current/public/uploads/content/." "$APP_ROOT/shared/uploads-content/"
    elif [ -d "$tmp_dir/public/uploads/content" ]; then
      cp -a "$tmp_dir/public/uploads/content/." "$APP_ROOT/shared/uploads-content/"
    fi
  fi
  rm -rf "$tmp_dir/public/uploads/content"
  mkdir -p "$tmp_dir/public/uploads"
  ln -sfn "$APP_ROOT/shared/uploads-content" "$tmp_dir/public/uploads/content"

  test -d "$tmp_dir/dist"
  test -d "$tmp_dir/node_modules"
  "$NODE_BIN" --check "$tmp_dir/server/web.mjs"
  "$NODE_BIN" --check "$tmp_dir/server/index.mjs"
  "$NODE_BIN" --check "$tmp_dir/admin/index.mjs"

  # 跨机 tar 搬运会丢失可执行位，恢复构建期需要的二进制
  chmod -R u+x "$tmp_dir/node_modules/.bin" 2>/dev/null || true
  find "$tmp_dir/node_modules" -type f -path '*/@esbuild/*/bin/*' -exec chmod u+x {} + 2>/dev/null || true
  find "$tmp_dir/node_modules" -type f -path '*/esbuild/bin/esbuild' -exec chmod u+x {} + 2>/dev/null || true
  # 用软链后的共享内容重新构建，dist 反映最新内容而非发布包里的旧内容
  ( cd "$tmp_dir" && "$NODE_BIN" --max-old-space-size=2048 node_modules/astro/astro.js build )

  mv "$tmp_dir" "$release_dir"
fi
ln -sfn "$release_dir" "$APP_ROOT/current"
systemctl try-restart touchstone-web.service
systemctl restart touchstone-api.service
systemctl try-restart touchstone-admin.service
