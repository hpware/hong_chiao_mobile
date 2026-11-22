import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Loading, PickerRow, Screen, Section, Status, TextRow, ValueRow } from '@/components/native';
import { useEnrollment } from '@/lib/enrollment';
import { formatRoc, getRewards, getRewardSemesters } from '@/lib/old/api';

const MERIT = ['嘉獎', '小功', '大功'];

/** 獎懲 from siw (ak010.jsp). */
export default function RewardsScreen() {
  const semesters = useQuery({ queryKey: ['legacy', 'reward-semesters'], queryFn: getRewardSemesters });
  const enrollment = useEnrollment();
  const [picked, setPicked] = useState<string | null>(null);
  const yms = picked ?? semesters.data?.find((s) => s.selected)?.value ?? semesters.data?.[0]?.value;
  const rewards = useQuery({ queryKey: ['legacy', 'rewards', yms], queryFn: () => getRewards(yms!), enabled: !!yms });

  if (semesters.isPending) return <Loading />;
  if (semesters.error) {
    return <Status title="無法載入獎懲" message={semesters.error.message} actionTitle="重試" onAction={() => semesters.refetch()} />;
  }

  return (
    <Screen onRefresh={() => rewards.refetch()}>
      <Section>
        <PickerRow
          label="學期"
          icon="calendar"
          selection={yms ?? ''}
          options={enrollment.filterYms(semesters.data).map((s) => ({ label: s.label, value: s.value }))}
          onChange={setPicked}
        />
      </Section>
      <Section title="獎懲紀錄">
        {rewards.isPending ? (
          <TextRow body="載入中…" tone="secondary" />
        ) : rewards.error ? (
          <TextRow body={`無法載入：${rewards.error.message}`} tone="destructive" />
        ) : rewards.data.length === 0 ? (
          <TextRow body="這學期沒有獎懲紀錄。" tone="secondary" />
        ) : (
          rewards.data.map((r, i) => (
            <ValueRow
              key={i}
              label={r.reason || r.type}
              subtitle={`${formatRoc(r.date)} · ${r.type}`}
              value={`${r.count} 支`}
              tone={MERIT.includes(r.type) ? 'success' : 'destructive'}
            />
          ))
        )}
      </Section>
    </Screen>
  );
}
