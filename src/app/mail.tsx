import { useQuery } from '@tanstack/react-query';

import { ActionRow, LoadingRow, Screen, Section, TextRow } from '@/components/native';
import { dateToRoc, getMail, type MailItem } from '@/lib/old/api';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 信件: the mailroom's log (siw 收件查詢, ZTT001) — what's waiting, and everything picked up. */
export default function MailScreen() {
  const waiting = useQuery({ queryKey: ['legacy', 'mail', 'waiting'], queryFn: () => getMail('waiting') });
  // The whole history: siw needs a range, so ask from long before any current student enrolled.
  const history = useQuery({
    queryKey: ['legacy', 'mail', 'history'],
    queryFn: () => getMail('history', '1000101', dateToRoc(new Date())),
  });

  return (
    <Screen onRefresh={() => Promise.all([waiting.refetch(), history.refetch()])}>
      <Section title="待領取" footer="到收發室領取時請攜帶學生證。">
        {waiting.isPending ? (
          <LoadingRow />
        ) : waiting.error ? (
          <ActionRow title={`無法載入：${errorText(waiting.error)}（點此重試）`} onPress={() => waiting.refetch()} />
        ) : waiting.data.length === 0 ? (
          <TextRow body="沒有待領取的信件或包裹。" tone="secondary" />
        ) : (
          waiting.data.map((m, i) => <MailRow key={`${m.trackingNo}-${i}`} item={m} />)
        )}
      </Section>

      <Section title="領取紀錄">
        {history.isPending ? (
          <LoadingRow />
        ) : history.error ? (
          <ActionRow title={`無法載入：${errorText(history.error)}（點此重試）`} onPress={() => history.refetch()} />
        ) : history.data.length === 0 ? (
          <TextRow body="沒有領取紀錄。" tone="secondary" />
        ) : (
          history.data.map((m, i) => <MailRow key={`${m.trackingNo}-${i}`} item={m} />)
        )}
      </Section>
    </Screen>
  );
}

function MailRow({ item }: { item: MailItem }) {
  const picked = item.pickedUpAt
    ? `${item.pickedUpAt} 由 ${item.pickedUpBy || '本人'} 領取`
    : '尚未領取';
  return (
    <TextRow
      title={item.sender || '信件'}
      meta={`登錄 ${item.registered}${item.trackingNo ? ` · ${item.trackingNo}` : ''}`}
      body={picked}
      tone={item.pickedUpAt ? 'default' : 'success'}
    />
  );
}
