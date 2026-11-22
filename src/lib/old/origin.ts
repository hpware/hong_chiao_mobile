import { ApiError } from '@/lib/http';
import { reportUnreachable, systemAnswered } from '@/lib/outage';

/**
 * Which siw host to talk to. The school runs the same legacy system behind several hosts, tried
 * in this order: siw (main proxy), tnd (second proxy), 71 (校務主機 1), then siw71 and siw72, which
 * normally only answer on the campus network. Every host is probed at once; the first healthy one in order wins.
 */

const HOSTS = [
  'https://siw.tpcu.edu.tw',
  'https://tnd.tpcu.edu.tw',
  // 校務主機 1.
  'https://71.tpcu.edu.tw',
  // Internal hosts: not sure they serve HTTPS, so try both.
  'https://siw71.tpcu.edu.tw',
  'http://siw71.tpcu.edu.tw',
  'https://siw72.tpcu.edu.tw',
  'http://siw72.tpcu.edu.tw',
];
const PROBE_MS = 5000;
/** Re-check a working host this often in case a preferred one came back. */
const KEEP_MS = 10 * 60_000;

/** Every siw host is down (or unreachable from here). */
export class LegacyDownError extends ApiError {
  /** The status page also shows the legacy system down: it's not the user's network. */
  outage: boolean;
  constructor(message: string, outage: boolean) {
    super(message);
    this.outage = outage;
  }
}

let current: { at: number; origin: Promise<string>; resolved?: string } | null = null;
let lastOrigin = HOSTS[0];
const changeListeners = new Set<(origin: string) => void>();

/** Called when requests move to another host (its session cookie doesn't carry over). */
export function onLegacyOriginChange(listener: (origin: string) => void) {
  changeListeners.add(listener);
  return () => void changeListeners.delete(listener);
}

/** The host most recently used (for the in-app browser before anything has been probed). */
export function lastLegacyOrigin() {
  return lastOrigin;
}

async function healthy(origin: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_MS);
  try {
    const res = await fetch(`${origin}/tsint/`, { method: 'GET', credentials: 'omit', signal: controller.signal });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function pick() {
  const order = HOSTS;
  const checks = order.map((o) => healthy(o));
  // Take the first healthy host in preference order, without waiting on slower ones behind it.
  for (let i = 0; i < order.length; i++) {
    if (await checks[i]) {
      systemAnswered('siw');
      return order[i];
    }
  }
  const outage = await reportUnreachable('siw');
  throw new LegacyDownError(outage.short, outage.confirmed);
}

/** The siw origin to use, probing hosts when there's no recent answer. */
export function legacyOrigin(): Promise<string> {
  if (!current || Date.now() - current.at > KEEP_MS) {
    const entry: NonNullable<typeof current> = { at: Date.now(), origin: Promise.resolve('') };
    entry.origin = pick().then((o) => {
      entry.resolved = o;
      if (o !== lastOrigin) {
        lastOrigin = o;
        changeListeners.forEach((l) => l(o));
      }
      return o;
    });
    current = entry;
    // While everything is down, screens share one answer for a short while instead of each
    // probing every host again.
    entry.origin.catch(() =>
      setTimeout(() => {
        if (current === entry) current = null;
      }, 15_000),
    );
  }
  return current.origin;
}

/** A request to `origin` failed at the server or network: probe again next time. */
export function legacyOriginFailed(origin: string) {
  if (current?.resolved === origin) current = null;
}
