#!/usr/bin/env node
/**
 * Sets the app version and bumps the build number everywhere iOS and Android read them, so every IPA is
 * distinguishable (AltStore and iOS compare CFBundleVersion when updating).
 *
 *   node scripts/bump-version.js          # same version, build + 1
 *   node scripts/bump-version.js 0.13.0   # new version, build + 1
 *
 * Writes app.json (expo.version, ios.buildNumber, android.versionCode), both Info.plists (the app
 * and the widget extension must match), the widget target's build settings and android/app/build.gradle.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const appJsonPath = path.join(root, 'app.json');
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const expo = appJson.expo;

const version = process.argv[2] ?? expo.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Bad version: ${version}`);
const build = Number(expo.ios?.buildNumber ?? 1) + 1;

expo.version = version;
expo.ios = { ...expo.ios, buildNumber: String(build) };
expo.android = { ...expo.android, versionCode: build };
fs.writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);

function setPlist(file, key, value) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) return;
  let xml = fs.readFileSync(p, 'utf8');
  const re = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`);
  if (!re.test(xml)) throw new Error(`${key} missing in ${file}`);
  xml = xml.replace(re, `$1${value}$2`);
  fs.writeFileSync(p, xml);
}

for (const plist of ['ios/app/Info.plist', 'ios/ExpoWidgetsTarget/Info.plist']) {
  setPlist(plist, 'CFBundleShortVersionString', version);
  setPlist(plist, 'CFBundleVersion', String(build));
}

const pbxPath = path.join(root, 'ios/app.xcodeproj/project.pbxproj');
if (fs.existsSync(pbxPath)) {
  const pbx = fs
    .readFileSync(pbxPath, 'utf8')
    .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`)
    .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
  fs.writeFileSync(pbxPath, pbx);
}

const gradlePath = path.join(root, 'android/app/build.gradle');
if (fs.existsSync(gradlePath)) {
  const gradle = fs
    .readFileSync(gradlePath, 'utf8')
    .replace(/versionCode \d+/, `versionCode ${build}`)
    .replace(/versionName "[^"]*"/, `versionName "${version}"`);
  fs.writeFileSync(gradlePath, gradle);
}

console.log(`${version} (${build})`);
