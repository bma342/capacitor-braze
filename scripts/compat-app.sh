#!/usr/bin/env bash
#
# Build a throwaway copy of `example/` against an OLDER Capacitor major, applying
# exactly — and only — the consumer-side edits C10 documents for that major.
#
# The peer dep, the podspec and Package.swift all claim Capacitor 6, 7 and 8. Both
# apps in this repo run 8, so 6 and 7 were claims rather than facts until this
# script existed. `verify-capacitor-compat` in .github/workflows/test.yml runs it
# on every PR; run it locally the same way:
#
#   bash scripts/compat-app.sh 7 android
#   bash scripts/compat-app.sh 6 ios-pods
#   bash scripts/compat-app.sh 6 ios-spm
#
# It resolves the *latest* release of the requested major, so a new 6.x/7.x that
# breaks the plugin turns this red — which is the point. Set COMPAT_WORKDIR to
# keep the generated app around for inspection.
#
# Every consumer edit below is mirrored in C10's support matrix. If you change
# one here, change it there in the same commit; the whole value of the script is
# that the documented edit list and the tested edit list are the same list.

set -euo pipefail

MAJOR="${1:-}"
LEG="${2:-}"

usage() {
  echo "usage: bash scripts/compat-app.sh <6|7> <android|ios-pods|ios-spm>" >&2
  exit 2
}

case "$MAJOR" in
  6 | 7) ;;
  *) usage ;;
esac
case "$LEG" in
  android | ios-pods | ios-spm) ;;
  *) usage ;;
esac

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_BASE="${COMPAT_WORKDIR:-$(mktemp -d)}"
APP="$WORK_BASE/cap$MAJOR-$LEG"

# CocoaPods refuses to run under a non-UTF-8 locale, and GitHub runners default
# to C. Harmless on Linux.
export LANG="${LANG:-en_US.UTF-8}"

# `cap add` runs the platform's dependency install as its last step, and on the
# iOS legs that step is what the consumer edits below exist to fix — so it is
# expected to fail here and `cap sync` re-runs it after the edits. Assert the
# project was actually generated rather than blanket-ignoring the exit code.
cap_add() {
  set +e
  npx cap add "$@"
  set -e
}

assert_generated() {
  if [ ! -e "$1" ]; then
    echo "::error::cap add did not generate $1" >&2
    exit 1
  fi
}

# "It compiled" is not "the plugin shipped". `@objc(BrazePlugin)` is the runtime
# name the CLI writes into capacitor.config.json's packageClassList and the
# Capacitor bridge resolves with NSClassFromString, so its presence in the built
# binary is the thing worth asserting.
assert_ios_plugin_linked() {
  local binary="$APP/dd/Build/Products/Debug-iphonesimulator/App.app/App.debug.dylib"
  if [ ! -f "$binary" ]; then
    binary="$APP/dd/Build/Products/Debug-iphonesimulator/App.app/App"
  fi
  # Dump to a file rather than piping into `grep -q`: -q closes the pipe on the
  # first match, nm dies of SIGPIPE, and `pipefail` then reports the *successful*
  # case as a failure. -F because the symbol name contains a literal `$`.
  nm -a "$binary" >"$APP/nm.txt"
  if ! grep -qF '_OBJC_CLASS_$_BrazePlugin' "$APP/nm.txt"; then
    echo "::error::the BrazePlugin Objective-C class is not linked into $binary" >&2
    exit 1
  fi
  grep -q '"BrazePlugin"' ios/App/App/capacitor.config.json
  echo "==> Capacitor $CAP_VERSION / $LEG: BUILD OK, BrazePlugin linked + in packageClassList"
}

# `npm view <pkg>@<range> version` prints a bare version when one release matches
# the range and `<pkg>@<v> '<v>'` lines when several do. Take the newest either way.
CAP_VERSION="$(npm view "@capacitor/core@$MAJOR" version | tail -1 | sed -E "s/.*'([^']+)'.*/\1/")"
echo "==> Capacitor $MAJOR resolves to $CAP_VERSION"

# ---------------------------------------------------------------------------
# Scaffold: example/ minus everything generated, with the Capacitor packages
# pinned to the target major and the plugin linked from this checkout.
# ---------------------------------------------------------------------------
rm -rf "$APP"
mkdir -p "$APP"
rsync -a \
  --exclude node_modules --exclude ios --exclude android \
  --exclude dist --exclude package-lock.json \
  "$REPO_ROOT/example/" "$APP/"

node - "$APP/package.json" "$CAP_VERSION" "$REPO_ROOT" <<'NODE'
const fs = require('fs');
const [file, version, repoRoot] = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
pkg.name = 'capacitor-braze-compat';
for (const dep of ['@capacitor/core', '@capacitor/ios', '@capacitor/android']) {
  pkg.dependencies[dep] = version;
}
pkg.devDependencies['@capacitor/cli'] = version;
pkg.dependencies['capacitor-braze'] = `file:${repoRoot}`;
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
NODE

cd "$APP"
npm install --no-audit --no-fund
npm run build

if [ "$LEG" = "android" ]; then
  npx cap add android
  echo "sdk.dir=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}" >android/local.properties

  if [ "$MAJOR" = "6" ]; then
    # C10: the edits a Capacitor 6 consumer still needs. Capacitor 6's template
    # ships AGP 8.2.1 / Gradle 8.2.1 / compileSdk 34; Braze 43.2.0's transitive
    # androidx.swiperefreshlayout 1.2.0 needs AGP >= 8.6.0 (which needs Gradle
    # >= 8.7) and androidx.recyclerview 1.4.0 needs compileSdk >= 35. These are
    # the minimum versions that clear both floors, not a blanket "use latest".
    sed -i.bak "s|gradle-8.2.1-all.zip|gradle-8.7-all.zip|" android/gradle/wrapper/gradle-wrapper.properties
    sed -i.bak "s|com.android.tools.build:gradle:8.2.1|com.android.tools.build:gradle:8.6.0|" android/build.gradle
    sed -i.bak "s|compileSdkVersion = 34|compileSdkVersion = 35|" android/variables.gradle
    rm -f android/gradle/wrapper/gradle-wrapper.properties.bak android/build.gradle.bak android/variables.gradle.bak
  fi
  # Capacitor 7 (AGP 8.7.2 / Gradle 8.11.1 / compileSdk 35) already clears every
  # floor, so it deliberately gets no edits — that is the claim under test.

  (cd android && ./gradlew :app:assembleDebug --no-daemon)

  APK="android/app/build/outputs/apk/debug/app-debug.apk"
  rm -rf "$APP/dexcheck"
  mkdir -p "$APP/dexcheck"
  unzip -o -q "$APK" 'classes*.dex' -d "$APP/dexcheck"
  if ! grep -a -q "Lcom/bma342/braze/BrazePlugin;" "$APP"/dexcheck/classes*.dex; then
    echo "::error::com.bma342.braze.BrazePlugin is not in $APK" >&2
    exit 1
  fi
  grep -q 'com.bma342.braze.BrazePlugin' android/app/src/main/assets/capacitor.plugins.json
  echo "==> Capacitor $CAP_VERSION / Android: BUILD OK, BrazePlugin present in the APK"

elif [ "$LEG" = "ios-pods" ]; then
  cap_add ios
  assert_generated ios/App/Podfile

  # C10 "Required Podfile config", both lines non-optional:
  #   platform :ios, '15.0'                -> CapacitorBraze.podspec's own floor
  #   use_frameworks! :linkage => :static  -> BrazeKit ships a static xcframework
  # Capacitor 6 ships 13.0, Capacitor 7 ships 14.0; both ship plain
  # `use_frameworks!`, so both need both edits.
  sed -i.bak -E "s/^platform :ios, '[0-9.]+'$/platform :ios, '15.0'/" ios/App/Podfile
  sed -i.bak "s/^use_frameworks!$/use_frameworks! :linkage => :static/" ios/App/Podfile
  rm -f ios/App/Podfile.bak
  grep -q "platform :ios, '15.0'" ios/App/Podfile
  grep -q "use_frameworks! :linkage => :static" ios/App/Podfile
  # Match the app target to the Podfile so Xcode doesn't warn about a target
  # deploying below its dependencies.
  sed -i.bak -E "s/IPHONEOS_DEPLOYMENT_TARGET = [0-9.]+/IPHONEOS_DEPLOYMENT_TARGET = 15.0/g" ios/App/App.xcodeproj/project.pbxproj
  rm -f ios/App/App.xcodeproj/project.pbxproj.bak

  npx cap sync ios
  (cd ios/App && xcodebuild build \
    -workspace App.xcworkspace -scheme App \
    -destination 'platform=iOS Simulator,name=iPhone 17,OS=latest' \
    -configuration Debug -derivedDataPath "$APP/dd" \
    CODE_SIGNING_ALLOWED=NO)
  assert_ios_plugin_linked

else
  cap_add ios --packagemanager SPM
  assert_generated ios/App/CapApp-SPM/Package.swift

  # The CLI stamps CapApp-SPM/Package.swift's `platforms: [.iOS(.vN)]` from the
  # app target's IPHONEOS_DEPLOYMENT_TARGET (getMajoriOSVersion() reads the
  # pbxproj), and the file itself says DO NOT MODIFY. So on the SPM path the app
  # target — not a Podfile — is where the plugin's iOS 15 floor is met. Without
  # this, SPM rejects the graph with "The package product 'CapacitorBraze'
  # requires minimum platform version 15.0".
  sed -i.bak -E "s/IPHONEOS_DEPLOYMENT_TARGET = [0-9.]+/IPHONEOS_DEPLOYMENT_TARGET = 15.0/g" ios/App/App.xcodeproj/project.pbxproj
  rm -f ios/App/App.xcodeproj/project.pbxproj.bak

  npx cap sync ios
  grep -q "platforms: \[.iOS(.v15)\]" ios/App/CapApp-SPM/Package.swift
  grep -q 'name: "CapacitorBraze"' ios/App/CapApp-SPM/Package.swift

  (cd ios/App && xcodebuild build \
    -project App.xcodeproj -scheme App \
    -destination 'platform=iOS Simulator,name=iPhone 17,OS=latest' \
    -configuration Debug -derivedDataPath "$APP/dd" \
    CODE_SIGNING_ALLOWED=NO)
  assert_ios_plugin_linked
fi
