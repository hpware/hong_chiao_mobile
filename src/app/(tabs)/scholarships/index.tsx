import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';

import { ActionRow, LoadingRow, NavRow, Screen, Section, TextRow } from '@/components/native';
import { listScholarships } from '@/lib/api/scholarship';

export default function ScholarshipsScreen() {
  const list = useQuery({ queryKey: ['scholarships'], queryFn: listScholarships });

  return (
    <Screen onRefresh={() => list.refetch()}>
      <Section title="開放申請中">
        {list.isPending ? (
          <LoadingRow />
        ) : list.error ? (
          <ActionRow
            title={`無法載入：${list.error.message}（點此重試）`}
            onPress={() => list.refetch()}
          />
        ) : list.data.length === 0 ? (
          <TextRow body="目前沒有可申請的獎學金。" tone="secondary" />
        ) : (
          list.data.map((row) => (
            <NavRow
              key={row.objid}
              title={row.Title}
              subtitle={`截止 ${row.EndDate} · 名額 ${row.Quota}`}
              onPress={() =>
                router.push({ pathname: '/scholarship/[id]', params: { id: row.objid, url: row.URL } })
              }
            />
          ))
        )}
      </Section>
    </Screen>
  );
}
