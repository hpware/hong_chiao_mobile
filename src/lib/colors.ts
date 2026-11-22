import { Platform, PlatformColor, type ColorValue } from 'react-native';

export type SystemColor =
  | 'label'
  | 'secondaryLabel'
  | 'tertiaryLabel'
  | 'placeholderText'
  | 'systemBackground'
  | 'secondarySystemBackground'
  | 'tertiarySystemFill'
  | 'systemBlue'
  | 'systemGray'
  | 'systemGreen'
  | 'systemOrange'
  | 'systemRed';

/** `PlatformColor` with iOS names that also works on Android. */
export function systemColor(name: SystemColor): ColorValue {
  // Android: colour resources with night variants, added by plugins/android-system-colors.js.
  return PlatformColor(Platform.OS === 'ios' ? name : `@color/ios_${name}`);
}
