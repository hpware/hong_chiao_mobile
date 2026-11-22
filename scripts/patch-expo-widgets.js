/**
 * expo-widgets reads the app group from Info.plist (`ExpoWidgetsAppGroupIdentifier`). Sideloading
 * tools (AltStore, SideStore, Sideloadly…) re-sign the app with a *renamed* group but leave
 * Info.plist alone, so the app writes the schedule where the widget can't read it and the widget
 * only ever shows its placeholder. This patch makes both sides use the group the build is
 * actually entitled to. Runs on `postinstall`; safe to run repeatedly.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'node_modules', 'expo-widgets', 'ios');
const MARK = '// hongchiao: resolve app group';

const storage = path.join(root, 'WidgetsStorage.swift');
let s = fs.readFileSync(storage, 'utf8');
if (!s.includes(MARK)) {
  s = s.replace(
    'public static var appGroupIdentifier: String? = Bundle.main.object(forInfoDictionaryKey: "ExpoWidgetsAppGroupIdentifier") as? String',
    `${MARK}
  public static var appGroupIdentifier: String? = resolveAppGroup()

  /// The configured group if this build is entitled to it, otherwise the matching group the
  /// re-signed build really has (from AltStore's \`ALTAppGroups\` or embedded.mobileprovision).
  static func resolveAppGroup() -> String? {
    let configured = Bundle.main.object(forInfoDictionaryKey: "ExpoWidgetsAppGroupIdentifier") as? String
    if let configured, FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: configured) != nil {
      return configured
    }
    var entitled: [String] = (Bundle.main.object(forInfoDictionaryKey: "ALTAppGroups") as? [String]) ?? []
    if let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
       let data = try? Data(contentsOf: url),
       let start = data.range(of: Data("<?xml".utf8)),
       let end = data.range(of: Data("</plist>".utf8), in: start.lowerBound..<data.endIndex),
       let plist = try? PropertyListSerialization.propertyList(from: data.subdata(in: start.lowerBound..<end.upperBound), format: nil) as? [String: Any],
       let entitlements = plist["Entitlements"] as? [String: Any],
       let groups = entitlements["com.apple.security.application-groups"] as? [String] {
      entitled += groups
    }
    let usable = entitled.filter { !$0.contains("*") && FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: $0) != nil }
    if let configured, let match = usable.first(where: { $0.hasPrefix(configured) || $0.contains(configured.replacingOccurrences(of: "group.", with: "")) }) {
      return match
    }
    return usable.first ?? configured
  }`,
  );
  if (!s.includes(MARK)) throw new Error('patch-expo-widgets: WidgetsStorage.swift changed upstream');
  fs.writeFileSync(storage, s);
}

const provider = path.join(root, 'Widgets', 'TimelineProvider.swift');
let p = fs.readFileSync(provider, 'utf8');
const before = 'Bundle.main.object(forInfoDictionaryKey: "ExpoWidgetsAppGroupIdentifier") as? String';
if (p.includes(before)) {
  p = p.split(before).join('WidgetsStorage.appGroupIdentifier');
  fs.writeFileSync(provider, p);
}
// Expose the resolved group so the app can show whether the widget can see its data.
const moduleFile = path.join(root, 'WidgetsModule.swift');
let m = fs.readFileSync(moduleFile, 'utf8');
if (!m.includes('Constant("appGroupIdentifier")')) {
  m = m.replace('    Constant("widgetsDirectory")', '    Constant("appGroupIdentifier") { () -> String? in WidgetsStorage.appGroupIdentifier }\n\n    Constant("widgetsDirectory")');
  if (!m.includes('Constant("appGroupIdentifier")')) throw new Error('patch-expo-widgets: WidgetsModule.swift changed upstream');
  fs.writeFileSync(moduleFile, m);
}
console.log('patch-expo-widgets: ok');
