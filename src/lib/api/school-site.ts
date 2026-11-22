import { parse } from 'node-html-parser';

/** The school's public website, fetched directly (no login, no sw/siw). */
export const SCHOOL_SITE = 'https://www.tpcu.edu.tw';
export const SCHOOL_NEWS_URL = `${SCHOOL_SITE}/p/422-1000-1000.php?Lang=zh-tw`;
export const UPTIME_SITE = 'https://tpcu-uptime.yhw.tw';

export type SchoolNews = {
  date: string;
  title: string;
  url: string;
  unit: string;
};

/** Sub-site host → office. Anything unknown just shows no unit. */
const UNITS: Record<string, string> = {
  aao: '教務處',
  sao: '學務處',
  gao: '總務處',
  cc: '圖資處',
  rdo: '研發處',
  ieec: '國際處',
  pc: '人事室',
  ac: '會計室',
  sec: '秘書室',
  lis: '圖書館',
  join: '招生',
  dcee: '推廣教育',
};

/** 最新消息 from www.tpcu.edu.tw (same list as its "更多最新消息" page). */
export async function getSchoolNews(): Promise<SchoolNews[]> {
  const res = await fetch(SCHOOL_NEWS_URL);
  if (!res.ok) throw new Error(`學校網站回應 ${res.status}`);
  const root = parse(await res.text());
  return root.querySelectorAll('#pageptlist .mtitle').flatMap((el) => {
    const a = el.querySelector('a');
    if (!a) return [];
    const url = a.getAttribute('href') ?? '';
    const host = url.match(/^https?:\/\/([^./]+)\./)?.[1] ?? '';
    return [
      {
        date: el.querySelector('.mdate')?.text.trim() ?? '',
        title: (a.getAttribute('title') ?? a.text).replace(/\(另開新視窗\)$/, '').trim(),
        url: url.startsWith('http') ? url : `${SCHOOL_SITE}${url}`,
        unit: UNITS[host] ?? '',
      },
    ];
  });
}

export type MonitorStatus = 'success' | 'degraded' | 'error' | 'maintenance' | string;

export type UptimeFeed = {
  status: MonitorStatus;
  updatedAt: string;
  groups: {
    name: string;
    components: { name: string; description: string; status: MonitorStatus }[];
  }[];
  reports: { title: string; status: string; updatedAt: string }[];
};

type RawFeed = {
  status: MonitorStatus;
  updatedAt: string;
  monitors: { id: number; status: MonitorStatus }[];
  pageComponents: {
    name: string;
    description: string;
    monitorId: number | null;
    order: number;
    groupId: number | null;
    groupOrder: number;
  }[];
  pageComponentGroups?: { id: number; name: string }[];
  statusReports?: { title: string; status: string; updatedAt: string }[];
};

/** tpcu-uptime (openstatus) JSON feed: one status per school system, checked every minute. */
export async function getUptime(): Promise<UptimeFeed> {
  const res = await fetch(`${UPTIME_SITE}/feed/json`);
  if (!res.ok) throw new Error(`狀態頁回應 ${res.status}`);
  const raw = (await res.json()) as RawFeed;
  const statusOf = new Map(raw.monitors.map((m) => [m.id, m.status]));
  const groupName = new Map((raw.pageComponentGroups ?? []).map((g) => [g.id, g.name]));
  const groups = new Map<
    number,
    {
      name: string;
      order: number;
      components: UptimeFeed['groups'][number]['components'];
    }
  >();
  for (const c of [...raw.pageComponents].sort((a, b) => a.order - b.order)) {
    const id = c.groupId ?? 0;
    if (!groups.has(id))
      groups.set(id, {
        name: groupName.get(id) ?? '其他',
        order: c.groupOrder,
        components: [],
      });
    groups.get(id)!.components.push({
      name: c.name,
      description: c.description,
      status: (c.monitorId != null && statusOf.get(c.monitorId)) || 'success',
    });
  }
  return {
    status: raw.status,
    updatedAt: raw.updatedAt,
    groups: [...groups.values()].sort((a, b) => a.order - b.order),
    reports: (raw.statusReports ?? []).filter((r) => r.status !== 'resolved'),
  };
}

export function statusLabel(status: MonitorStatus) {
  switch (status) {
    case 'success':
      return '正常';
    case 'degraded':
      return '效能降低';
    case 'error':
      return '無法連線';
    case 'maintenance':
      return '維護中';
    default:
      return status;
  }
}

const SYSTEM_HOSTS = {
  sw: ['sw.tpcu.edu.tw'],
  // Any one of these working is enough for the app (it fails over between them).
  siw: ['siw.tpcu.edu.tw', 'tnd.tpcu.edu.tw', '71.tpcu.edu.tw'],
} as const;

/** The new (sw) and old (siw) systems' state on the status page; undefined when not listed. */
export function schoolSystemsStatus(feed: UptimeFeed) {
  const components = feed.groups.flatMap((g) => g.components);
  const of = (hosts: readonly string[]): MonitorStatus | undefined => {
    const statuses = components.filter((c) => hosts.includes((c.description ?? '').trim())).map((c) => c.status);
    if (!statuses.length) return undefined;
    for (const s of ['success', 'degraded', 'maintenance']) if (statuses.includes(s)) return s;
    return 'error';
  };
  return { sw: of(SYSTEM_HOSTS.sw), siw: of(SYSTEM_HOSTS.siw) };
}

export function isDownStatus(status: MonitorStatus | undefined) {
  return status === 'error' || status === 'maintenance';
}
