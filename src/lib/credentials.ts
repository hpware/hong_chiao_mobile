import * as SecureStore from 'expo-secure-store';

/**
 * The 校務系統 (sw) password, kept in the iOS Keychain (this device only, readable only while
 * unlocked) so that after being logged out unexpectedly the login screen is already filled in
 * and one tap signs back in. Removed when the user signs out themselves.
 */
const KEY = 'portalAccount';
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function savePortalPassword(uid: string, pwd: string) {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify({ uid, pwd }), options);
  } catch {
    // Keychain unavailable: the user just types it next time.
  }
}

/** The saved password for this student, if any. */
export async function loadPortalPassword(uid: string) {
  try {
    const raw = await SecureStore.getItemAsync(KEY, options);
    const saved = raw ? (JSON.parse(raw) as { uid: string; pwd: string }) : null;
    return saved && saved.uid === uid ? saved.pwd : null;
  } catch {
    return null;
  }
}

export async function clearPortalPassword() {
  try {
    await SecureStore.deleteItemAsync(KEY, options);
  } catch {
    // ignore
  }
}
