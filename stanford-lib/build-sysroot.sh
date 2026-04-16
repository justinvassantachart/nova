#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────
# build-sysroot.sh
# Updates the stanford/ files inside public/sysroot.zip with the
# current contents of this directory.
# ───────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SYSROOT_ZIP="$PROJECT_ROOT/public/sysroot.zip"
TEMP_DIR="$(mktemp -d)"

if [ ! -f "$SYSROOT_ZIP" ]; then
    echo "Error: $SYSROOT_ZIP not found"
    exit 1
fi

echo "📦 Extracting current sysroot.zip..."
unzip -q "$SYSROOT_ZIP" -d "$TEMP_DIR"

echo "🔄 Replacing stanford/ files..."
# Remove old stanford files
rm -rf "$TEMP_DIR/stanford"
mkdir -p "$TEMP_DIR/stanford"

# Copy all files from stanford-lib/ (excluding README and build script)
for f in "$SCRIPT_DIR"/*.cpp "$SCRIPT_DIR"/*.h; do
    if [ -f "$f" ]; then
        cp "$f" "$TEMP_DIR/stanford/"
    fi
done

echo "📦 Rebuilding sysroot.zip..."
(cd "$TEMP_DIR" && zip -qr "$SYSROOT_ZIP" .)

echo "🧹 Cleaning up..."
rm -rf "$TEMP_DIR"

echo "✅ Updated $SYSROOT_ZIP with stanford-lib/ files"
echo "   Hard-refresh the browser to pick up changes."
