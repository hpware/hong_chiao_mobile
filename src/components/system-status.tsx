import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';

import { NavRow, Section, TextRow, ValueRow } from '@/components/native';
import { getUptime, isDownStatus, schoolSystemsStatus, statusLabel } from '@/lib/api/school-site';
import { useOutage, useReached } from '@/lib/outage';

export const SYSTEM_NAMES = { sw: '新校務系統', siw: '舊校務系統' } as const;

/** sw and siw state from the status page (shared, refreshed every minute). */
export function useSchoolSystems() {
  const uptime = useQuery({ queryKey: ['uptime'], queryFn: getUptime, refetchInterval: 60_000 });
  return uptime.data ? schoolSystemsStatus(uptime.data) : null;
}

/**
 * Checked as soon as the app opens: when either school system is down (per the status page or
 * because the app couldn't reach it), say which one at the top of 首頁. Nothing when all is well.
 */
export function SystemStatusSection() {
  const systems = useSchoolSystems();
  const outages = { sw: useOutage('sw'), siw: useOutage('siw') };
  const reached = { sw: useReached('sw'), siw: useReached('siw') };

  if (outages.sw?.kind === 'offline' || outages.siw?.kind === 'offline') {
    return (
      <Section>
        <TextRow title="沒有網路連線" body="手機目前沒有連上網路，請檢查 Wi-Fi 或行動網路。" tone="destructive" />
      </Section>
    );
  }

  const state = (['sw', 'siw'] as const).map((k) => {
    const listed = systems?.[k];
    // The app getting answers beats the status page (which only checks the public hosts).
    if (reached[k]) return { k, down: false, label: '正常' };
    const down = !!outages[k] || isDownStatus(listed);
    const label = isDownStatus(listed) ? statusLabel(listed!) : outages[k] ? '沒有回應' : listed ? statusLabel(listed) : '未知';
    return { k, down, label };
  });
  if (!state.some((s) => s.down)) return null;

  const both = state.every((s) => s.down);
  return (
    <Section
      title="系統狀態"
      footer={
        both
          ? '新、舊校務系統目前都無法使用，請稍後再試。'
          : `${SYSTEM_NAMES[state.find((s) => s.down)!.k]}目前無法使用，相關功能暫時無法載入。`
      }
    >
      {state.map((s) => (
        <ValueRow key={s.k} label={SYSTEM_NAMES[s.k]} value={s.label} tone={s.down ? 'destructive' : 'success'} />
      ))}
      <NavRow title="查看系統狀態" icon="waveform.path.ecg" onPress={() => router.push('/status')} />
    </Section>
  );
}
