/**
 * Android stand-ins for the iOS semantic colours the app uses (`label`, `systemBlue` …), as
 * colour resources with night variants so they follow dark mode natively. Read in JS through
 * `PlatformColor('@color/ios_<name>')` (see src/lib/colors.ts).
 */
const { AndroidConfig, withAndroidColors, withAndroidColorsNight } = require('expo/config-plugins');

const COLORS = {
  label: ['#1B1B1F', '#E4E2E6'],
  secondaryLabel: ['#5E5E66', '#A1A1A8'],
  tertiaryLabel: ['#8E8E96', '#76767E'],
  placeholderText: ['#8E8E96', '#76767E'],
  systemBackground: ['#FBF8FD', '#131316'],
  secondarySystemBackground: ['#EFEDF1', '#1F1F23'],
  tertiarySystemFill: ['#E4E1E9', '#2A2A2F'],
  systemBlue: ['#1F57C3', '#9EC1FF'],
  systemGray: ['#8E8E93', '#8E8E93'],
  systemGreen: ['#146C2E', '#7DD99A'],
  systemOrange: ['#B45309', '#FFB870'],
  systemRed: ['#B3261E', '#F2B8B5'],
};

function apply(colors, index) {
  for (const [name, values] of Object.entries(COLORS)) {
    colors = AndroidConfig.Colors.assignColorValue(colors, { name: `ios_${name}`, value: values[index] });
  }
  return colors;
}

module.exports = (config) => {
  config = withAndroidColors(config, (c) => {
    c.modResults = apply(c.modResults, 0);
    return c;
  });
  return withAndroidColorsNight(config, (c) => {
    c.modResults = apply(c.modResults, 1);
    return c;
  });
};
