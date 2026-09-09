#!/usr/bin/env bash
#
# 打包并发布一个新版本。
#
#   ./scripts/release.sh
#
# 版本号取自 app.json，请先改好它再跑（package.json 的 version 也要跟着改）。
# 安装包走 GitHub Releases 而不是提交进仓库：APK 有 60MB+，进了 git 历史就永远
# 留在那里，每发一版再压一份，克隆的人全都要付这个代价。
set -euo pipefail

cd "$(dirname "$0")/.."

: "${JAVA_HOME:=/opt/homebrew/opt/openjdk@17}"
: "${ANDROID_HOME:=/opt/homebrew/share/android-commandlinetools}"
export JAVA_HOME ANDROID_HOME
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

VERSION=$(node -p "require('./app.json').expo.version")
PACKAGE_VERSION=$(node -p "require('./package.json').version")

if [ "$VERSION" != "$PACKAGE_VERSION" ]; then
  echo "app.json 是 $VERSION，package.json 是 $PACKAGE_VERSION——两处要一致。"
  exit 1
fi

# Android 靠 versionCode 判断新旧，它必须随版本号单调递增。
# 由版本号推导而不是手工维护：手工维护迟早会漏改，而漏改的表现是
# 用户装不上更新，且没有任何报错。
EXPECTED_CODE=$(node -p "
  const [a,b,c] = require('./app.json').expo.version.split('.').map(Number);
  a*10000 + b*100 + c
")
ACTUAL_CODE=$(node -p "require('./app.json').expo.android.versionCode")
if [ "$EXPECTED_CODE" != "$ACTUAL_CODE" ]; then
  echo "app.json 的 android.versionCode 是 $ACTUAL_CODE，按版本号 $VERSION 应该是 $EXPECTED_CODE。"
  exit 1
fi

if [ ! -f credentials/keystore.properties ]; then
  echo "缺少 credentials/keystore.properties，构建出来的包会用 debug 密钥签名，"
  echo "装不到已有安装之上。见 docs/build.md。"
  exit 1
fi

echo "== 检查 =="
npx tsc --noEmit
npm run verify:chem
npm run verify:bloom
npm run verify:context
npm run verify:photo
npx expo-doctor

echo "== 构建 $VERSION =="
npm run sync-skills
npm run build:ketcher
npx expo prebuild -p android
(cd android && ./gradlew assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a)

APK="OrganicLabMobile-${VERSION}-arm64.apk"
mkdir -p dist
cp android/app/build/outputs/apk/release/app-release.apk "dist/$APK"

echo "== 产物 =="
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --print-certs "dist/$APK" | head -2
"$ANDROID_HOME/build-tools/36.0.0/aapt2" dump badging "dist/$APK" | grep "^package"
ls -lh "dist/$APK"

echo
echo "下一步："
echo "  gh release create v$VERSION dist/$APK --title \"v$VERSION\" --notes-file <(写更新说明)"
