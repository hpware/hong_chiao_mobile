import * as SecureStore from 'expo-secure-store';

/**
 * Small persisted settings. Everything stays on the device — the app never
 * talks to anything except the school portal the user configured.
 */
export const StorageKeys = {
  apiUrl: 'apiUrl',
  schoolName: 'schoolName',
  /** Only used to prefill the login form (e.g. after a password change). */
  studentId: 'studentId',
  userName: 'userName',
  /** Set while signed in (cleared on any sign-out), so an outage at launch doesn't sign you out. */
  wasSignedIn: 'wasSignedIn',
  theme: 'theme',
} as const;

type Key = (typeof StorageKeys)[keyof typeof StorageKeys];

export async function getItem(key: Key) {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setItem(key: Key, value: string) {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // ignore — settings are a convenience
  }
}

export async function removeItem(key: Key) {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // ignore
  }
}

/** Known YB2K deployments (from the web app's README). */
/** This app is for 臺北城市科技大學 (TPCU) only. */
export const SCHOOL = { name: '臺北城市科技大學', apiUrl: 'https://sw.tpcu.edu.tw/YB2K' } as const;

