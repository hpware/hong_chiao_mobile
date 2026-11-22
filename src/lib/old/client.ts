import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import { ApiError, encodeForm, USER_AGENT, type FormFields } from '@/lib/http';
import { buildMultipart, type MultipartPart } from '@/lib/multipart';
import { systemAnswered } from '@/lib/outage';
import { LegacyDownError, legacyOrigin, legacyOriginFailed, onLegacyOriginChange } from '@/lib/old/origin';

export { LegacyDownError, legacyOrigin, lastLegacyOrigin } from '@/lib/old/origin';

export type { MultipartPart } from '@/lib/multipart';

/**
 * Client for TPCU's legacy student system ("舊系統", siw), which still hosts 課表, 成績, 缺曠,
 * 獎懲, 請假 and ~50 other functions. Ported from the Agora-AI backend (`backend/src/client.py`).
 *
 * It uses the same student ID as the YB2K portal but has no captcha. Some students have a
 * different password here, so once siw accepts a password it's saved in the iOS Keychain
 * (this device only, readable only while unlocked) and reused, so the app never asks again.
 * The native cookie store keeps its JSESSIONID (shared with the in-app browser for siw pages).
 */


let credentials: { uid: string; pwd: string } | null = null;
let loggedIn = false;
let pendingLogin: Promise<void> | null = null;
/** The siw menu page returned by the login request (lists every function). */
let menuHtml = '';

export class LegacyUnavailableError extends ApiError {}
/** siw rejected the student ID / password. */
export class LegacyPasswordError extends LegacyUnavailableError {}
/** The siw session ended on its own (idle timeout, or the account signed in/out elsewhere). */
export class LegacySessionEndedError extends LegacyUnavailableError {}

export const SESSION_ENDED_MESSAGE =
  '可能是閒置太久，或這個帳號在其他地方（例如電腦）登入或登出了舊系統。為了不把你在其他地方的登入踢掉，App 不會自動重新登入。';

export type LegacyAccount = { uid: string; pwd: string };

// --- Keychain -------------------------------------------------------------------------------

const KEYCHAIN_KEY = 'legacyAccount';
const keychainOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
/** The account last saved to the Keychain (only ever one that siw accepted). */
let saved: LegacyAccount | null = null;

async function readKeychain(): Promise<LegacyAccount | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEYCHAIN_KEY, keychainOptions);
    return raw ? (JSON.parse(raw) as LegacyAccount) : null;
  } catch {
    return null;
  }
}

async function writeKeychain(account: LegacyAccount | null) {
  saved = account;
  try {
    if (account) await SecureStore.setItemAsync(KEYCHAIN_KEY, JSON.stringify(account), keychainOptions);
    else await SecureStore.deleteItemAsync(KEYCHAIN_KEY, keychainOptions);
  } catch {
    // Keychain unavailable: the account still works for this launch.
  }
}

// --- Account state (observable, for screens) ------------------------------------------------

/** `none`: no password yet; `ready`: have one; `rejected`: siw refused the one we have. */
export type LegacyStatus = 'none' | 'ready' | 'rejected';
let status: LegacyStatus = 'none';
const listeners = new Set<() => void>();

function setStatus(next: LegacyStatus) {
  if (status === next) return;
  status = next;
  listeners.forEach((l) => l());
}

export function useLegacyStatus() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}

export function hasLegacyAccount() {
  return status === 'ready';
}

export function getLegacyStudentId() {
  return credentials?.uid ?? saved?.uid ?? '';
}

// Once a session dies, stay out until the user chooses to reconnect: siw allows one session per
// account, so silently logging back in would keep kicking the user's other session (e.g. a PC).
let sessionEnded = false;
const endedListeners = new Set<() => void>();

/** Called when the siw session ends unexpectedly, and again whenever something needs it meanwhile. */
export function onLegacySessionEnded(listener: () => void) {
  endedListeners.add(listener);
  return () => void endedListeners.delete(listener);
}

function endSession() {
  loggedIn = false;
  sessionEnded = true;
  endedListeners.forEach((l) => l());
}

/** The user chose to log back in to siw after being logged out. */
export function reconnectLegacy() {
  sessionEnded = false;
  return ensureLegacySession();
}

function applyAccount(account: LegacyAccount | null) {
  credentials = account;
  sessionEnded = false;
  loggedIn = false;
  pendingLogin = null;
  menuHtml = '';
  setStatus(account ? 'ready' : 'none');
}

// The session cookie belongs to one host: moving to another means logging in again there.
onLegacyOriginChange(() => {
  loggedIn = false;
  menuHtml = '';
});

/** On launch: pick up the siw password saved in the Keychain for this student. */
export async function restoreLegacyAccount(uid: string) {
  const stored = await readKeychain();
  saved = stored;
  if (stored && stored.uid === uid) applyAccount(stored);
}

/**
 * After the portal login: prefer the siw password already saved for this student; otherwise
 * try the portal password. Resolves to `false` when siw rejects it, i.e. the student must
 * enter their siw password once (see `/legacy-password`).
 */
export async function connectLegacyAccount(uid: string, portalPassword: string) {
  const stored = saved?.uid === uid ? saved : await readKeychain();
  const account = stored?.uid === uid ? stored : { uid, pwd: portalPassword };
  applyAccount(account);
  try {
    await ensureLegacySession();
    return true;
  } catch (e) {
    if (!(e instanceof LegacyPasswordError)) return true; // siw busy/offline: try again on first use
    if (stored?.uid === uid && stored.pwd !== portalPassword) {
      // The saved password stopped working (changed on siw?); maybe it's the portal one now.
      applyAccount({ uid, pwd: portalPassword });
      try {
        await ensureLegacySession();
        return true;
      } catch {
        // fall through
      }
    }
    setStatus('rejected');
    return false;
  }
}

/** Checks a password against siw without changing the current account. */
export async function legacyAccepts(account: LegacyAccount) {
  const html = await perchk(account);
  return !html.includes('無此帳號或密碼');
}

/** Signs in to siw with an explicitly entered password; saves it to the Keychain if accepted. */
export async function signInLegacy(account: LegacyAccount) {
  applyAccount(account);
  try {
    await ensureLegacySession();
  } catch (e) {
    if (e instanceof LegacyPasswordError) setStatus('rejected');
    throw e;
  }
}

/** Saves an account siw has accepted (e.g. found while the portal rejected the same password). */
export function rememberLegacyAccount(account: LegacyAccount) {
  void writeKeychain(account);
}

/** After the portal session expires: forget the live siw session but keep the saved password. */
export function clearLegacySession() {
  applyAccount(null);
}

/** On logout: forget the session and the saved siw password. */
export function clearLegacyAccount() {
  applyAccount(null);
  void writeKeychain(null);
}

const EXPIRED_MARKERS = ['重新登入', 'Please Logon', 'Please Login'];
const TIMEOUT_MS = 30_000;

async function send(method: 'GET' | 'POST', path: string, body?: string | Uint8Array, contentType?: string) {
  const origin = await legacyOrigin();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('連線逾時')), TIMEOUT_MS);
  try {
    const response = await fetch(`${origin}${path}`, {
      method,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'zh-TW,zh;q=0.9',
        ...(contentType ? { 'Content-Type': contentType } : {}),
      },
      body: body as BodyInit | undefined,
      credentials: 'include',
      signal: controller.signal,
    }).catch(async () => {
      legacyOriginFailed(origin);
      throw new HostFailedError('無法連線到舊系統。');
    });
    // The proxies answer 502/503 when the system behind them is down.
    if (response.status >= 500) {
      legacyOriginFailed(origin);
      throw new HostFailedError(`舊系統暫時無法使用（${response.status}），請稍後再試。`);
    }
    systemAnswered('siw');
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

/** One host failed; another may still work (see `request`). */
class HostFailedError extends ApiError {}

function perchk(account: LegacyAccount) {
  return send(
    'POST',
    '/tsint/perchk.jsp',
    encodeForm([
      ['hid_type', 'S'],
      ['uid', account.uid],
      ['pwd', account.pwd],
      ['err', 'N'],
      ['fncid', ''],
      ['ls_chochk', 'N'],
    ]),
    'application/x-www-form-urlencoded',
  );
}

async function login() {
  const account = credentials;
  if (!account || status === 'rejected') {
    throw new LegacyPasswordError('需要舊系統（siw）的密碼。');
  }
  const html = await perchk(account);
  if (html.includes('無此帳號或密碼')) {
    setStatus('rejected');
    throw new LegacyPasswordError('舊系統（siw）不接受這組密碼。');
  }
  // siw keeps whoever first logged in on a JSESSIONID. Never show another student's data.
  const signedInAs = html.match(/id=std_id1[^>]*value="([^"]*)"/)?.[1];
  if (signedInAs && signedInAs !== account.uid) {
    throw new ApiError(`舊系統仍登入著另一個帳號（${signedInAs}）。請到「設定」登出後重新登入。`);
  }
  // The school sometimes answers with an unauthenticated page while busy; check a real page.
  // (POST like the website does: a plain GET of this page stalls for ~20 s and drops the session.)
  const check = await send('POST', '/tsint/ck_pro/ck001_00.jsp', 'fncid=CK001', 'application/x-www-form-urlencoded');
  if (EXPIRED_MARKERS.some((m) => check.includes(m))) {
    throw new ApiError('舊系統目前忙碌或無法登入，請稍後再試。');
  }
  menuHtml = html;
  loggedIn = true;
  // After the caller's request goes out (listeners make requests of their own).
  setTimeout(() => loginListeners.forEach((l) => l(account.uid)), 0);
  if (saved?.uid !== account.uid || saved.pwd !== account.pwd) void writeKeychain(account);
}

const loginListeners = new Set<(uid: string) => void>();

/** Called after each fresh siw login (first use, re-login, or a switch to another host). */
export function onLegacyLogin(listener: (uid: string) => void) {
  loginListeners.add(listener);
  return () => void loginListeners.delete(listener);
}

/** Makes sure there's a live siw session (e.g. before opening an siw page in the in-app browser). */
export function ensureLegacySession() {
  if (loggedIn) return Promise.resolve();
  if (sessionEnded) {
    endSession(); // ask again (e.g. after the user tapped 重試)
    return Promise.reject(new LegacySessionEndedError('舊系統已登出。'));
  }
  pendingLogin ??= login().finally(() => {
    pendingLogin = null;
  });
  return pendingLogin;
}

/** The siw menu page from the last login. */
export async function getLegacyMenuHtml() {
  await ensureLegacySession();
  return menuHtml;
}

/**
 * Sends a request to siw, logging in first. If the host fails, tries once more on the next
 * working host (logging in there); if none works, the error says whether it's a known outage.
 */
async function request(method: 'GET' | 'POST', path: string, body?: string | Uint8Array, contentType?: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      await ensureLegacySession();
      const html = await send(method, path, body, contentType);
      if (EXPIRED_MARKERS.some((m) => html.includes(m))) {
        endSession();
        throw new LegacySessionEndedError('舊系統已登出。');
      }
      return html;
    } catch (e) {
      if (!(e instanceof HostFailedError) || attempt > 0) throw e;
      await legacyOrigin(); // throws LegacyDownError when no host answers
    }
  }
}

export function legacyPost(path: string, fields: FormFields) {
  return request('POST', path, encodeForm(fields), 'application/x-www-form-urlencoded');
}

/** Posts a hand-built multipart form (see `buildMultipart`). */
export function legacyPostMultipart(path: string, parts: MultipartPart[]) {
  const { body, contentType } = buildMultipart(parts);
  return request('POST', path, body, contentType);
}

/**
 * Opens an siw function the way its menu does: `fnc.jsp` answers with a self-submitting form
 * carrying the function's real URL and arguments. Returns that page's HTML.
 */
export async function openLegacyFunction(fncid: string, extra: FormFields = []) {
  const launcher = await legacyPost('/tsint/fnc.jsp', [['fncid', fncid]]);
  const action = launcher.match(/<form[^>]*action="([^"]+)"/i)?.[1];
  if (!action) throw new ApiError('舊系統沒有回應這個功能。');
  const fields: [string, string][] = [...launcher.matchAll(/<input[^>]*type="?hidden"?[^>]*>/gi)].flatMap((m) => {
    const name = m[0].match(/name="?([^"\s>]+)/i)?.[1];
    const value = m[0].match(/value="?([^">]*)/i)?.[1] ?? '';
    return name ? [[name, value] as [string, string]] : [];
  });
  const extraFields = Array.isArray(extra) ? extra : Object.entries(extra);
  return legacyPost(`/tsint/${action}`, [...fields, ...extraFields]);
}
