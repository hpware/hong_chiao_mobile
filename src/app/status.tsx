import { useQuery } from '@tanstack/react-query';

import { openInApp } from '@/lib/browser';
import { Loading, NavRow, Screen, Section, Status, TextRow, ValueRow } from '@/components/native';
import { getUptime, statusLabel, UPTIME_SITE, type MonitorStatus } from '@/lib/api/school-site';

const tone = (s: MonitorStatus) => (s === 'success' ? 'success' : s === 'error' ? 'destructive' : 'secondary');

/** 系統狀態: tpcu-uptime's per-system checks, so "is it me or the school?" has an answer. */
export default function StatusScreen() {
  const uptime = useQuery({ queryKey: ['uptime'], queryFn: getUptime, refetchInterval: 60_000 });

  if (uptime.isPending) return <Loading />;
  if (uptime.error) {
    return <Status title="無法載入系統狀態" message={uptime.error.message} actionTitle="重試" onAction={() => uptime.refetch()} />;
  }
  const { data } = uptime;
  const down = data.groups.flatMap((g) => g.components).filter((c) => c.status !== 'success').length;
  const updated = new Date(data.updatedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });

  return (
    <Screen onRefresh={() => uptime.refetch()}>
      <Section footer={`${updated} 更新 · 每分鐘檢查一次。結果只代表監測站看到的狀況，實際狀態以學校公告為準。`}>
        <ValueRow
          label={down === 0 ? '所有系統正常' : `${down} 個系統異常`}
          icon={down === 0 ? 'checkmark.circle.fill' : 'exclamationmark.triangle.fill'}
          tone={down === 0 ? 'success' : 'destructive'}
          value={down === 0 ? '正常' : '異常'}
        />
      </Section>

      {data.reports.length > 0 ? (
        <Section title="公告">
          {data.reports.map((r, i) => (
            <TextRow key={i} title={r.title} meta={new Date(r.updatedAt).toLocaleString('zh-TW')} />
          ))}
        </Section>
      ) : null}

      {data.groups.map((g) => (
        <Section key={g.name} title={g.name}>
          {g.components.map((c) => (
            <ValueRow key={c.name} label={c.name} subtitle={c.description || undefined} value={statusLabel(c.status)} tone={tone(c.status)} />
          ))}
        </Section>
      ))}

      <Section>
        <NavRow title="在瀏覽器開啟狀態頁" icon="safari" external onPress={() => openInApp(UPTIME_SITE)} />
      </Section>
    </Screen>
  );
}
