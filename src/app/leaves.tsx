import { useMutation, useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { Alert } from 'react-native';

import { Loading, NavRow, Screen, Section, Status, TextRow, ValueRow } from '@/components/native';
import { deleteLeave, formatRoc, getLeaves, todayRoc, type LeaveEntry } from '@/lib/old/api';

// The website defaults to a single day; show this semester-ish window instead.
const RANGE = { start: todayRoc(-180), end: todayRoc(60) };

function dates(l: LeaveEntry) {
  return l.startDate === l.endDate ? formatRoc(l.startDate) : `${formatRoc(l.startDate)}–${formatRoc(l.endDate)}`;
}

function status(l: LeaveEntry) {
  if (l.actionStatus.includes('作廢')) return { text: '已作廢', tone: 'secondary' as const };
  const s = l.officerStatus || l.teacherStatus;
  if (s.includes('核准') && !s.includes('待')) return { text: s, tone: 'success' as const };
  if (s.includes('不')) return { text: s, tone: 'destructive' as const };
  return { text: s || '處理中', tone: 'secondary' as const };
}

/** 請假紀錄 from the legacy system (ck001_view.jsp), with delete for leaves still pending. */
export default function LeavesScreen() {
  const leaves = useQuery({ queryKey: ['legacy', 'leaves', RANGE], queryFn: () => getLeaves(RANGE.start, RANGE.end) });
  const remove = useMutation({ mutationFn: deleteLeave });

  const confirmDelete = (l: LeaveEntry) =>
    Alert.alert('刪除假單', `${l.reason}（${dates(l)}）\n單號 ${l.barcode}`, [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: async () => {
          try {
            const result = await remove.mutateAsync(l.deleteArgs!);
            Alert.alert(result.success === false ? '無法刪除' : '假單已刪除', result.message || undefined);
          } catch (e) {
            Alert.alert('無法刪除', e instanceof Error ? e.message : String(e));
          } finally {
            void leaves.refetch();
          }
        },
      },
    ]);

  const toolbar = (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button icon="plus" accessibilityLabel="新增假單" onPress={() => router.push('/leave-new')} />
    </Stack.Toolbar>
  );

  if (leaves.isPending) {
    return (
      <>
        {toolbar}
        <Loading />
      </>
    );
  }
  if (leaves.error) {
    return (
      <>
        {toolbar}
        <Status title="無法載入假單" message={leaves.error.message} actionTitle="重試" onAction={() => leaves.refetch()} />
      </>
    );
  }

  const items = [...leaves.data].reverse();

  return (
    <>
      {toolbar}
      <Screen onRefresh={() => leaves.refetch()}>
        <Section
          title={`${formatRoc(RANGE.start)} – ${formatRoc(RANGE.end)}`}
          footer="已核准或已作廢的假單無法刪除。點右上角 + 新增假單。">
          {items.length === 0 ? (
            <TextRow body="這段期間沒有假單。" tone="secondary" />
          ) : (
            items.map((l) => {
              const s = status(l);
              return l.deleteArgs ? (
                <NavRow
                  key={l.barcode}
                  title={l.reason}
                  subtitle={`${dates(l)} · 可刪除`}
                  detail={s.text}
                  onPress={() => confirmDelete(l)}
                />
              ) : (
                <ValueRow key={l.barcode} label={l.reason} subtitle={`${dates(l)} · ${l.barcode}`} value={s.text} tone={s.tone} />
              );
            })
          )}
        </Section>
      </Screen>
    </>
  );
}
