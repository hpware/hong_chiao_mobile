import { useQuery } from '@tanstack/react-query';
import * as Network from 'expo-network';

/**
 * Detects whether the phone is on TPCU's own network (校內網路).
 *
 * TPCU's address block, registered with TWNIC as "T-TSINT.EDU.TW-NET": 120.102.0.0 – 120.102.63.255.
 * Its servers also use IPv6 under 2001:288:2009::/48.
 * Campus Wi-Fi may hand out such an address directly; otherwise we ask the school's speed test
 * (speedtest.tpcu.edu.tw) which IPv4 address it sees, falling back to Cloudflare's /cdn-cgi/trace.
 */

function inTpcuBlock(ip: string) {
  const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) return Number(v4[1]) === 120 && Number(v4[2]) === 102 && Number(v4[3]) <= 63;
  return /^2001:288:2009:/i.test(ip);
}

async function fetchText(url: string, ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await (await fetch(url, { signal: controller.signal, credentials: 'omit' })).text();
  } finally {
    clearTimeout(timer);
  }
}

const IPV4 = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/;

/**
 * The school's own speed test (LibreSpeed) echoes the caller's IPv4 address as the school sees it,
 * which is the reliable answer on campus. It usually only answers inside the school, so off
 * campus fall back to Cloudflare's trace.
 */
async function schoolSeenIp() {
  const text = await fetchText('https://speedtest.tpcu.edu.tw/backend/getIP.php', 3000);
  let value = text;
  try {
    const json = JSON.parse(text) as { processedString?: string };
    if (json.processedString) value = json.processedString;
  } catch {
    // plain-text answer
  }
  return value.match(IPV4)?.[1] ?? null;
}

async function cloudflareIp() {
  const text = await fetchText('https://www.cloudflare.com/cdn-cgi/trace', 5000);
  return text.match(/^ip=(.+)$/m)?.[1]?.trim() ?? null;
}

async function publicIp() {
  // Ask both at once; prefer the school's answer when it has one.
  const cloudflare = cloudflareIp().catch(() => null);
  const school = await schoolSeenIp().catch(() => null);
  return school ?? (await cloudflare);
}

export type CampusNetwork = { onCampus: boolean; connection: string; ip: string | null };

export async function detectCampusNetwork(): Promise<CampusNetwork> {
  const state = await Network.getNetworkStateAsync();
  const connection = state.type === Network.NetworkStateType.WIFI ? 'Wi-Fi' : state.type === Network.NetworkStateType.CELLULAR ? '行動網路' : '網路';
  const local = await Network.getIpAddressAsync().catch(() => '');
  if (local && inTpcuBlock(local)) return { onCampus: true, connection, ip: local };
  // Cellular is never the campus network; skip the lookup.
  if (state.type === Network.NetworkStateType.CELLULAR) return { onCampus: false, connection, ip: null };
  const ip = await publicIp().catch(() => null);
  return { onCampus: !!ip && inTpcuBlock(ip), connection, ip };
}

// Not shown to the user; it only decides what the app can reach and how failures are explained.
let cached: { at: number; value: Promise<CampusNetwork> } | null = null;

/** `detectCampusNetwork`, cached for a minute (for error handling outside React). */
export function getCampusNetwork() {
  if (!cached || Date.now() - cached.at > 60_000) {
    const value = detectCampusNetwork();
    cached = { at: Date.now(), value };
    value.catch(() => (cached = null));
  }
  return cached.value;
}

/**
 * Explains why a school server couldn't be reached. Off campus, the usual reason is the school
 * closing outside access (e.g. during an incident) while it still works on the campus network.
 */
export async function unreachableMessage(server: string) {
  const net = await getCampusNetwork().catch(() => null);
  if (net && !net.onCampus) {
    return `無法連線到${server}。學校可能暫時關閉了校外連線，請連上校內網路後再試。`;
  }
  return `無法連線到${server}，伺服器可能暫時停機，請稍後再試。`;
}

/** Re-checks whenever the network changes (e.g. joining campus Wi-Fi). For gating campus-only features. */
export function useCampusNetwork() {
  const state = Network.useNetworkState();
  return useQuery({
    queryKey: ['campus-network', state.type, state.isConnected],
    queryFn: detectCampusNetwork,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
