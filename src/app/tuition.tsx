import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import {
  ActionRow,
  LoadingRow,
  NavRow,
  Screen,
  Section,
  TextRow,
  ValueRow,
} from '@/components/native';
import { getParticipatingSemesters } from '@/lib/api/auth';
import { getProofOfPayment, getTuition } from '@/lib/api/tuition';
import { formatNumber, parseAmount } from '@/lib/format';
import { formatSemester } from '@/lib/semester';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function TuitionScreen() {
  const semesters = useQuery({ queryKey: ['user', 'semesters'], queryFn: getParticipatingSemesters });
  const tuition = useQueries({
    queries: (semesters.data ?? []).map((s) => ({
      queryKey: ['tuition', s.year, s.semi],
      queryFn: () => getTuition(s.year, s.semi),
    })),
  });

  const proof = useMutation({ mutationFn: getProofOfPayment });
  const openProof = async (year: number, semester: number) => {
    if (semester !== 1 && semester !== 2) return;
    try {
      const file = await proof.mutateAsync({ year, semester });
      router.push({ pathname: '/proof', params: { id: file.id, name: file.name } });
    } catch (e) {
      Alert.alert('無法產生繳費證明', errorText(e) || '請稍後再試。');
    }
  };

  return (
    <Screen
      onRefresh={() => Promise.all([semesters.refetch(), ...tuition.map((q) => q.refetch())])}>
      <Section footer="金額僅供參考，實際以學校公告為準。">
        <NavRow title="繳費單" icon="doc.text" onPress={() => router.push('/bill')} />
        <NavRow title="補繳費單" icon="doc.badge.plus" onPress={() => router.push('/bill?kind=balance')} />
        <NavRow title="就學抵免申請" icon="percent" onPress={() => router.push('/discount')} />
      </Section>

      {semesters.isPending ? (
        <Section>
          <LoadingRow />
        </Section>
      ) : semesters.error ? (
        <Section>
          <ActionRow title="無法取得學費資訊（點此重試）" onPress={() => semesters.refetch()} />
        </Section>
      ) : semesters.data.length === 0 ? (
        <Section>
          <TextRow body="查無學費資訊。" tone="secondary" />
        </Section>
      ) : (
        semesters.data.map((s, i) => {
          const q = tuition[i];
          const details = q?.data?.details;
          const discounts = Math.max(0, parseAmount(details?.discounts));
          const due = Math.max(0, parseAmount(details?.due));
          const paid = Math.max(0, parseAmount(details?.paid));
          const refund = parseAmount(details?.refund);
          const balance = due - paid - refund;
          const generating =
            proof.isPending && proof.variables?.year === s.year && proof.variables?.semester === s.semi;

          return (
            <Section key={`${s.year}-${s.semi}`} title={formatSemester(s.year, s.semi)}>
              {!q || q.isPending ? (
                <LoadingRow />
              ) : q.error ? (
                <ActionRow title={`無法載入：${errorText(q.error)}（點此重試）`} onPress={() => q.refetch()} />
              ) : !details ? (
                <TextRow body="查無學雜費資訊" tone="secondary" />
              ) : (
                <>
                  <ValueRow
                    label="狀態"
                    value={
                      balance === 0
                        ? '已付清'
                        : balance > 0
                          ? `尚欠 ${formatNumber(balance)}`
                          : `應退 ${formatNumber(-balance)}`
                    }
                    tone={balance > 0 ? 'destructive' : balance < 0 ? 'success' : 'secondary'}
                  />
                  <ValueRow label="應繳" value={formatNumber(due)} />
                  <ValueRow label="已繳" value={formatNumber(paid)} />
                  {discounts > 0 ? <ValueRow label="抵免" value={formatNumber(discounts)} /> : null}
                  {refund !== 0 ? <ValueRow label="退費" value={formatNumber(refund)} /> : null}
                  {balance > 0 ? (
                    <ActionRow
                      title="查看繳費單"
                      icon="dollarsign.circle"
                      onPress={() =>
                        router.push({
                          pathname: '/bill',
                          params: { year: String(s.year), semester: String(s.semi) },
                        })
                      }
                    />
                  ) : (
                    <ActionRow
                      title="繳費證明"
                      icon="checkmark.seal"
                      loading={generating}
                      disabled={proof.isPending || (s.semi !== 1 && s.semi !== 2)}
                      onPress={() => void openProof(s.year, s.semi)}
                    />
                  )}
                </>
              )}
            </Section>
          );
        })
      )}
    </Screen>
  );
}
