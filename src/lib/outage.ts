import * as Network from 'expo-network';
import { useSyncExternalStore } from 'react';

import { getCampusNetwork } from '@/lib/campus-network';
import { getUptime } from '@/lib/api/school-site';

/**
 * When a school system stops answering, tell the user once (not on every screen) and say whether
 * it's down for everyone, judged by the status page (tpcu-uptime), or likely their connection.
 */

export type SchoolSystem = 'sw' | 'siw';

const SYSTEMS: Record<SchoolSystem, { name: string; hosts: string[] }> = {
  sw: { name: '新校務系統', hosts: ['sw.tpcu.edu.tw'] },
  siw: { name: '舊校務系統', hosts: ['siw.tpcu.edu.tw', 'tnd.tpcu.edu.tw', '71.tpcu.edu.tw'] },
};

export type Outage = {
  system: SchoolSystem;
  /** `offline`: the phone has no internet at all; `down`/`unreachable`: the school's side. */
  kind: 'offline' | 'down' | 'unreachable';
  /** The status page also shows it down: it's not the user's network. */
  confirmed: boolean;
  title: string;
  message: string;
  /** A few words for inline errors (「無法載入：…」). */
  short: string;
};

const listeners = new Set<(o: Outage) => void>();
const lastShown: Partial<Record<SchoolSystem | 'offline', number>> = {};
const QUIET_MS = 10 * 60_000;

// The latest problem per system, for screens that show it inline (e.g. the login screen) instead
// of an alert. Cleared once that system answers again.
const latest: Partial<Record<SchoolSystem, Outage>> = {};
const latestListeners = new Set<() => void>();

function setLatest(system: SchoolSystem, outage: Outage | undefined) {
  if (latest[system] === outage) return;
  latest[system] = outage;
  latestListeners.forEach((l) => l());
}

// Systems the app reached since its last failure (e.g. an internal siw host while the status page,
// which checks from outside, shows the public ones down).
const reached: Partial<Record<SchoolSystem, boolean>> = {};

/** `system` answered normally: forget its outage. */
export function systemAnswered(system: SchoolSystem) {
  if (!reached[system]) {
    reached[system] = true;
    latestListeners.forEach((l) => l());
  }
  if (latest[system]) setLatest(system, undefined);
}

/** Whether the app has reached `system` since its last failure. */
export function useReached(system: SchoolSystem) {
  return useSyncExternalStore(
    (l) => {
      latestListeners.add(l);
      return () => latestListeners.delete(l);
    },
    () => !!reached[system],
  );
}

/** The current problem reaching `system`, if any. */
export function useOutage(system: SchoolSystem) {
  return useSyncExternalStore(
    (l) => {
      latestListeners.add(l);
      return () => latestListeners.delete(l);
    },
    () => latest[system],
  );
}

/** Called (at most every 10 minutes per system) when a school system can't be reached. */
export function onOutage(listener: (o: Outage) => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Whether the phone can reach the internet at all (independent of the school). */
async function online() {
  const state = await Network.getNetworkStateAsync().catch(() => null);
  if (state && (state.isConnected === false || state.isInternetReachable === false)) return false;
  return true;
}

/** A quick request to somewhere that's always up, to tell "no internet" from "school down". */
async function internetAnswers() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    await fetch('https://www.cloudflare.com/cdn-cgi/trace', { signal: controller.signal, credentials: 'omit' });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Whether the status page shows every monitored host of `system` down (null: no answer). */
async function statusPageSaysDown(system: SchoolSystem) {
  const feed = await getUptime().catch(() => null);
  if (!feed) return null;
  const hosts = SYSTEMS[system].hosts;
  const ours = feed.groups.flatMap((g) => g.components).filter((c) => hosts.includes((c.description ?? '').trim()));
  if (!ours.length) return null;
  return ours.every((c) => c.status === 'error' || c.status === 'maintenance');
}

/**
 * `system` didn't answer: work out why, notify listeners (throttled) and return the message to
 * show where the request failed.
 */
export async function reportUnreachable(system: SchoolSystem): Promise<Outage> {
  const { name } = SYSTEMS[system];
  let outage: Outage;
  const [down, net] = (await online())
    ? await Promise.all([statusPageSaysDown(system), getCampusNetwork().catch(() => null)])
    : [null, null];
  // No status page either? Then check whether there's any internet at all.
  if (down === null && !(await online().then((ok) => ok && internetAnswers()))) {
    outage = {
      system,
      kind: 'offline',
      confirmed: false,
      title: '沒有網路連線',
      message: '手機目前沒有連上網路，請檢查 Wi-Fi 或行動網路後再試。',
      short: '沒有網路連線',
    };
  } else if (down) {
    outage = {
      system,
      kind: 'down',
      confirmed: true,
      title: `${name}目前停止服務`,
      message: `系統狀態顯示${name}目前無法連線，請稍後再試。`,
      short: `${name}目前停止服務`,
    };
  } else if (net && !net.onCampus) {
    outage = {
      system,
      kind: 'unreachable',
      confirmed: false,
      title: `無法連線到${name}`,
      message: `網路正常，但連不到${name}。學校可能暫時關閉了校外連線，請連上校內網路後再試。`,
      short: `連不到${name}`,
    };
  } else {
    outage = {
      system,
      kind: 'unreachable',
      confirmed: false,
      title: `無法連線到${name}`,
      message: `網路正常，但${name}沒有回應，可能暫時停機，請稍後再試。`,
      short: `${name}沒有回應`,
    };
  }
  reached[system] = false;
  setLatest(system, outage);
  const key = outage.kind === 'offline' ? 'offline' : system;
  const now = Date.now();
  if (now - (lastShown[key] ?? 0) > QUIET_MS) {
    lastShown[key] = now;
    listeners.forEach((l) => l(outage));
  }
  return outage;
}
