import * as WebBrowser from 'expo-web-browser';

/** Opens a page in the in-app browser, closed with an ✕ (iOS 26 otherwise shows a ✓ "Done"). */
export function openInApp(url: string) {
  return WebBrowser.openBrowserAsync(url, { dismissButtonStyle: 'close' });
}
