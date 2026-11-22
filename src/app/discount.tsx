import { useNativeState } from '@expo/ui';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import {
  ActionRow,
  Loading,
  PickerRow,
  Screen,
  Section,
  Status,
  TextFieldRow,
  TextRow,
  ToggleRow,
  ValueRow,
} from '@/components/native';
import { isDiscountEnabled } from '@/lib/api/home';
import { getDiscount } from '@/lib/api/tuition';
import { htmlToText } from '@/lib/format';

type Discount = Awaited<ReturnType<typeof getDiscount>>;

const indigenousGroups = [
  { label: '無', value: '' },
  { label: '阿美族', value: '原_1' },
  { label: '泰雅族', value: '原_2' },
  { label: '排灣族', value: '原_3' },
  { label: '布農族', value: '原_4' },
  { label: '卑南族', value: '原_5' },
  { label: '鄒(曹)族', value: '原_6' },
  { label: '魯凱族', value: '原_7' },
  { label: '賽夏族', value: '原_8' },
  { label: '雅美族(達悟族)', value: '原_9' },
  { label: '邵族', value: '原_A' },
  { label: '噶瑪蘭族', value: '原_B' },
  { label: '太魯閣族(德魯固族)', value: '原_C' },
  { label: '凱奇萊雅族', value: '原_D' },
  { label: '賽德克族', value: '原_E' },
  { label: '拉阿魯哇族', value: '原_F' },
  { label: '卡那卡那富族', value: '原_G' },
] as const;

/** Ports `/tuition/discount` (就學抵免). Like the web app, submitting is not wired up yet. */
export default function DiscountScreen() {
  const feature = useQuery({ queryKey: ['feature', 'discount'], queryFn: isDiscountEnabled });
  const discount = useQuery({
    queryKey: ['discount'],
    queryFn: getDiscount,
    enabled: feature.data === true,
  });

  if (feature.isPending) return <Loading text="檢查是否開放申請…" />;
  if (feature.error) {
    return (
      <Status title="無法載入" message={feature.error.message} actionTitle="重試" onAction={() => feature.refetch()} />
    );
  }
  if (!feature.data) {
    return <Status title="尚未開放" icon="calendar.badge.clock" message="學校目前沒有開放就學抵免申請。" />;
  }
  if (discount.isPending) return <Loading />;
  if (discount.error) {
    return (
      <Status title="無法載入" message={discount.error.message} actionTitle="重試" onAction={() => discount.refetch()} />
    );
  }
  return <DiscountForm data={discount.data} />;
}

function DiscountForm({ data: d }: { data: Discount }) {
  const emailState = useNativeState(d.email ?? '');
  const phoneState = useNativeState(d.phoneNumber ?? '');
  const [, setEmail] = useState(d.email ?? '');
  const [, setPhone] = useState(d.phoneNumber ?? '');
  const [clan, setClan] = useState<string>(d.originalClan ?? '');
  const [livingOutside, setLivingOutside] = useState(d.isBoarder === true);

  return (
    <Screen>
      <Stack.Screen options={{ title: `${d.semiYear ?? ''}-${d.semester ?? ''} 就學抵免` }} />
      <Section title="申請人">
        <ValueRow label="學號" value={d.studentId} />
        <ValueRow label="姓名" value={d.studentName} />
      </Section>

      {d.note ? (
        <Section title="說明">
          <TextRow body={htmlToText(d.note)} />
        </Section>
      ) : null}

      <Section title="聯絡資料">
        <TextFieldRow
          state={emailState}
          onChangeText={setEmail}
          placeholder="必填"
          label="電子信箱"
          keyboard="email-address"
          contentType="emailAddress"
        />
        <TextFieldRow
          state={phoneState}
          onChangeText={setPhone}
          placeholder="必填"
          label="住家電話"
          keyboard="phone-pad"
          contentType="telephoneNumber"
        />
      </Section>

      <Section>
        <PickerRow
          label="原住民族籍"
          selection={clan as (typeof indigenousGroups)[number]['value']}
          options={indigenousGroups}
          onChange={setClan}
        />
        <ToggleRow label="校外租屋" value={livingOutside} onChange={setLivingOutside} />
      </Section>

      <Section footer="送出後即不得更改。">
        <ActionRow
          title="送出申請"
          onPress={() => Alert.alert('尚未開放', '送出功能尚未完成（網頁版同樣尚未開放）。')}
        />
      </Section>
    </Screen>
  );
}
