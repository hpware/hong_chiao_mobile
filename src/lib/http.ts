/**
 * On-device replacement for the web app's `chromeFetch` + `univeralComponents`.
 *
 * The Next.js server had to run its own cookie jar because it proxied many
 * users. On a phone there is exactly one user, so we let the native HTTP stack
 * (NSURLSession / OkHttp, which back Expo's global `fetch`) keep the school's
 * ASP.NET cookies.
 *
 * Redirects are followed by hand: with `redirect: 'follow'`, Expo's native fetch
 * can report the *original* URL as `response.url` (and `redirected: false`)
 * after following a redirect, e.g. under Expo Go's dev request interceptor.
 * The login and session-expiry checks depend on the real final URL, so
 * `request()` tracks it itself and pins it onto the returned response.
 */

import { TurboModuleRegistry, type TurboModule } from 'react-native';

import { reportUnreachable, systemAnswered } from '@/lib/outage';
import { buildMultipart, type MultipartPart } from '@/lib/multipart';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

const REQUEST_TIMEOUT_MS = 30_000;

export const expiredSessionMessage = 'Session 過期了或無效。請重新登入。';

/** Thrown whenever the school portal tells us we are not logged in. */
export class SessionExpiredError extends Error {
  constructor(message = expiredSessionMessage) {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The portal didn't answer (or its gateway said it's down). */
export class SchoolDownError extends ApiError {}

let currentApiUrl = '';

/** Set by the config provider whenever the user picks / changes the school portal URL. */
export function setApiUrl(url: string) {
  currentApiUrl = url.trim();
}

export function getApiUrl() {
  if (!currentApiUrl) {
    throw new ApiError('尚未設定校務系統網址，請先在登入頁面設定。');
  }
  return currentApiUrl;
}

export function endpoint(path: string, apiUrl = getApiUrl()): string {
  const base = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return new URL(normalizedPath, base).toString();
}

export function apiOrigin(apiUrl = getApiUrl()) {
  return new URL(apiUrl).origin;
}

export type FormFields = [string, string][] | Record<string, string>;

/** Encode like `URLSearchParams#toString()` (spaces as `+`). */
export function encodeForm(fields: FormFields) {
  const entries = Array.isArray(fields) ? fields : Object.entries(fields);
  return entries
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key).replace(/%20/g, '+')}=${encodeURIComponent(value).replace(/%20/g, '+')}`,
    )
    .join('&');
}

type RequestOptions = {
  headers?: Record<string, string>;
  /** Already-encoded body (a string, or bytes for multipart uploads). */
  body?: string | Uint8Array;
  signal?: AbortSignal;
};

const MAX_REDIRECTS = 20;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

async function request(method: 'GET' | 'POST', path: string, options: RequestOptions = {}) {
  let currentUrl = endpoint(path);
  let currentMethod: string = method;
  let body = options.body;
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    Accept: '*/*',
    ...options.headers,
  };
  if (method === 'POST' && !headers.Origin) headers.Origin = apiOrigin();

  // Hermes doesn't reliably ship AbortSignal.timeout/any, so combine by hand.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('連線逾時')), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', onAbort);

  try {
    for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
      let response: Response;
      try {
        response = await fetch(currentUrl, {
          method: currentMethod,
          headers,
          body: body as BodyInit | undefined,
          credentials: 'include',
          redirect: 'manual',
          signal: controller.signal,
        });
      } catch (e) {
        if (options.signal?.aborted) throw e;
        throw new SchoolDownError((await reportUnreachable('sw')).short);
      }
      // The school's gateway answers 502–504 when the portal behind it is down.
      if (response.status >= 502 && response.status <= 504) {
        throw new SchoolDownError((await reportUnreachable('sw')).short);
      }
      systemAnswered('sw');
      const location = response.headers.get('location');
      if (!REDIRECT_STATUSES.has(response.status) || !location) {
        // Pin the URL we actually ended up at; see the note at the top of this file.
        Object.defineProperty(response, 'url', { value: currentUrl, configurable: true });
        return response;
      }
      await response.arrayBuffer().catch(() => undefined);
      const previousOrigin = new URL(currentUrl).origin;
      currentUrl = new URL(location, currentUrl).toString();
      if (new URL(currentUrl).origin !== previousOrigin) {
        delete headers.Origin;
        delete headers['X-Requested-With'];
      }
      if (
        response.status === 303 ||
        ((response.status === 301 || response.status === 302) && currentMethod === 'POST')
      ) {
        currentMethod = 'GET';
        body = undefined;
        delete headers['Content-Type'];
        delete headers.Origin;
      }
    }
    throw new ApiError('校務系統重新導向次數過多。');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

const ajaxHeaders = {
  'X-Requested-With': 'XMLHttpRequest',
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
};

export function get(path: string, options: RequestOptions = {}) {
  return request('GET', path, options);
}

export function post(path: string, options: RequestOptions = {}) {
  return request('POST', path, options);
}

/** GET with the XHR headers the portal's own JS sends. */
export function ajaxGet(path: string) {
  return get(path, { headers: ajaxHeaders });
}

/** POST a urlencoded form with the XHR headers the portal's own JS sends. */
/** POST a hand-built multipart form (see `buildMultipart`) with the XHR header. */
export function ajaxPostMultipart(path: string, parts: MultipartPart[]) {
  const { body, contentType } = buildMultipart(parts);
  return post(path, { headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': contentType }, body });
}

export function ajaxPost(path: string, fields?: FormFields) {
  return post(path, {
    headers: ajaxHeaders,
    body: fields ? encodeForm(fields) : undefined,
  });
}

function isLoginPage(url: string) {
  return url.toLowerCase().split('?')[0].endsWith('/b2kportal/login.aspx');
}

/**
 * POST and parse JSON. When the portal session has expired it redirects to the
 * login page (HTML), so treat that — and `OnNoLogin` — as an expired session.
 */
export async function ajaxPostJson<T = any>(path: string, fields?: FormFields): Promise<T> {
  const response = await ajaxPost(path, fields);
  return parseJsonResponse<T>(response);
}

export async function parseJsonResponse<T = any>(response: Response): Promise<T> {
  if (isLoginPage(response.url) || response.status === 401 || response.status === 403) {
    throw new SessionExpiredError();
  }
  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    if (/<form[^>]+Login\.aspx/i.test(text)) throw new SessionExpiredError();
    throw new ApiError(`校務系統回傳了無法解析的資料（${response.status}）`);
  }
  if (data && typeof data === 'object' && data.OnNoLogin === true) {
    throw new SessionExpiredError();
  }
  return data as T;
}

export function assertNotLoginPage(response: Response) {
  if (isLoginPage(response.url)) throw new SessionExpiredError();
}

export function getHiddenInputValue(html: string, inputName: string) {
  // Match the input by either `id` or `name`. The ASP.NET anti-forgery token
  // (__RequestVerificationToken) is rendered with only a `name` attribute.
  const inputPattern = new RegExp(
    `<input\\b(?=[^>]*\\b(?:id|name)=["']${inputName}["'])[^>]*>`,
    'i',
  );
  const inputMatch = html.match(inputPattern);
  const valueMatch = inputMatch?.[0].match(/\bvalue=["']([^"']*)["']/i);
  return valueMatch?.[1] ?? '';
}

export function isLoginResponseUrl(url: string) {
  return isLoginPage(url);
}

/**
 * Empties the native cookie store (sw and siw sessions). siw keeps whoever first logged in on a
 * JSESSIONID, so without this the next account to sign in would still see the previous
 * student's 缺曠/請假/課表.
 */
export function clearAllCookies() {
  const networking = TurboModuleRegistry.get<{ clearCookies(cb: (ok: boolean) => void): void } & TurboModule>('Networking');
  return new Promise<void>((resolve) => {
    if (!networking?.clearCookies) return resolve();
    networking.clearCookies(() => resolve());
  });
}
