#!/usr/bin/env bash
# 基于 electron-builder 输出的 linux-arm64-unpacked，用系统 dpkg-deb 打 .deb。
# 对齐 cc-switch-arm64-kylin：绕开 electron-builder 在跨架构下的 fpm 问题。

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNPACKED="$ROOT/dist-installer/linux-arm64-unpacked"
PKG_NAME="tinypost"
VERSION="$(node -p "require('$ROOT/package.json').version")"
ARCH="arm64"
OUT_DEB="$ROOT/dist-installer/${PKG_NAME}_${VERSION}_${ARCH}.deb"
MAINTAINER="xyztony999 <42613048+xyztony999@users.noreply.github.com>"
HOMEPAGE="$(node -p "require('$ROOT/package.json').homepage || ''")"

if [[ ! -d "$UNPACKED" ]]; then
  echo "缺少 $UNPACKED — 先跑 npm run build && npx electron-builder --linux AppImage --arm64" >&2
  exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

INSTALL_DIR="/opt/TinyPost"
mkdir -p "$STAGE$INSTALL_DIR"
cp -a "$UNPACKED/." "$STAGE$INSTALL_DIR/"

find "$STAGE$INSTALL_DIR" -maxdepth 2 -type f | while read -r f; do
  if head -c 4 "$f" 2>/dev/null | grep -qP '^\x7fELF'; then
    chmod +x "$f"
  fi
done

mkdir -p "$STAGE/usr/bin"
cat > "$STAGE/usr/bin/tinypost" <<EOF
#!/bin/sh
exec /opt/TinyPost/tinypost --no-sandbox "\$@"
EOF
chmod +x "$STAGE/usr/bin/tinypost"

ICON_SRC="$ROOT/resources/icon.png"
if [[ -f "$ICON_SRC" ]]; then
  mkdir -p "$STAGE/usr/share/icons/hicolor/512x512/apps"
  cp "$ICON_SRC" "$STAGE/usr/share/icons/hicolor/512x512/apps/tinypost.png"
fi

mkdir -p "$STAGE/usr/share/applications"
cat > "$STAGE/usr/share/applications/tinypost.desktop" <<EOF
[Desktop Entry]
Name=TinyPost
Comment=Lightweight local API client
Exec=/usr/bin/tinypost %U
Terminal=false
Type=Application
Icon=tinypost
StartupWMClass=tinypost
Categories=Network;Development;
EOF

mkdir -p "$STAGE/DEBIAN"
INSTALL_SIZE_KB="$(du -sk "$STAGE/opt" | awk '{print $1}')"
cat > "$STAGE/DEBIAN/control" <<EOF
Package: $PKG_NAME
Version: $VERSION
Section: net
Priority: optional
Architecture: $ARCH
Maintainer: $MAINTAINER
Installed-Size: $INSTALL_SIZE_KB
Depends: libgtk-3-0, libnss3, libasound2
Recommends: libappindicator3-1
Homepage: $HOMEPAGE
Description: TinyPost - lightweight local API client
 Offline-first API client for intranet / Kylin desktop environments.
 Data stays in local SQLite. No cloud sync required.
EOF

cat > "$STAGE/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e
if [ -f /opt/TinyPost/chrome-sandbox ]; then
  chown root:root /opt/TinyPost/chrome-sandbox || true
  chmod 4755 /opt/TinyPost/chrome-sandbox || true
fi
update-desktop-database -q /usr/share/applications || true
gtk-update-icon-cache -q -t /usr/share/icons/hicolor 2>/dev/null || true
exit 0
EOF
chmod +x "$STAGE/DEBIAN/postinst"

cat > "$STAGE/DEBIAN/postrm" <<'EOF'
#!/bin/sh
set -e
update-desktop-database -q /usr/share/applications || true
gtk-update-icon-cache -q -t /usr/share/icons/hicolor 2>/dev/null || true
exit 0
EOF
chmod +x "$STAGE/DEBIAN/postrm"

echo "==> 构建 $OUT_DEB"
dpkg-deb --root-owner-group --build -Zxz "$STAGE" "$OUT_DEB"
ls -lh "$OUT_DEB"
echo "安装：  sudo dpkg -i $OUT_DEB"
