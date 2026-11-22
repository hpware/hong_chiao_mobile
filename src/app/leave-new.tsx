import { useNativeState } from '@expo/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import {
  ActionRow,
  LoadingRow,
  NavRow,
  PickerRow,
  Screen,
  Section,
  TextFieldRow,
  SelectRow,
  TextRow,
} from '@/components/native';
import { applyLeave, dateToRoc, formatRoc, getLeaveForm, getSchedule, getScheduleSemesters, type LeaveAttachment } from '@/lib/old/api';
import type { ScheduleEntry } from '@/lib/old/parsers';
import { formatTimeRange } from '@/lib/old/schedule';
import { pickAttachment } from '@/lib/pick-file';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const PUBLIC_LEAVE = '23';

/** Days the form can be opened for: a week back (sick leave is filed afterwards) to two weeks ahead. */
function dayOptions() {
  const today = new Date();
  return Array.from({ length: 22 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i - 7);
    const label = `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）${i === 7 ? ' 今天' : ''}`;
    return { label, value: dateToRoc(d), weekday: d.getDay() === 0 ? 7 : d.getDay() };
  });
}

function periodLabel(p: string) {
  return /^\d$/.test(p) ? `第 ${p} 節` : p;
}

const PERIOD_NAMES = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

type ClassGroup = { title: string; subtitle: string; periods: string[] };

/** Back-to-back periods of the same course become one class, e.g. C語言與實習 · 第 2–4 節 · 09:20–12:10. */
function groupClasses(
  scheduled: string[],
  order: string[],
  entryFor: (p: string) => ScheduleEntry | undefined,
): ClassGroup[] {
  const groups: { course: string | undefined; periods: string[] }[] = [];
  for (const p of scheduled) {
    const course = entryFor(p)?.course;
    const last = groups.at(-1);
    const adjacent = last && order.indexOf(p) === order.indexOf(last.periods.at(-1)!) + 1;
    if (last && adjacent && course && last.course === course) last.periods.push(p);
    else groups.push({ course, periods: [p] });
  }
  return groups.map(({ course, periods }) => {
    const first = periods[0];
    const lastP = periods.at(-1)!;
    const range =
      periods.length > 1 && /^\d$/.test(first) ? `第 ${first}–${lastP} 節` : periodLabel(first);
    const start = formatTimeRange(entryFor(first)?.time ?? '').split('–')[0];
    const end = formatTimeRange(entryFor(lastP)?.time ?? '').split('–')[1];
    const room = entryFor(first)?.classroom;
    return {
      title: course ?? periodLabel(first),
      subtitle: [course ? range : '', start && end ? `${start}–${end}` : '', room].filter(Boolean).join(' · ') || '　',
      periods,
    };
  });
}

/** 新增假單: the website's 學生網路請假作業 form for one day. */
export default function NewLeaveScreen() {
  const queryClient = useQueryClient();
  const [days] = useState(dayOptions);
  const [date, setDate] = useState(days[7].value);
  const [typeId, setTypeId] = useState('21');
  const [periods, setPeriods] = useState<string[]>([]);
  const reasonState = useNativeState('');
  const [reason, setReason] = useState('');
  const [publicReason, setPublicReason] = useState('');
  const [attachment, setAttachment] = useState<LeaveAttachment | null>(null);

  const form = useQuery({ queryKey: ['legacy', 'leave-form', date], queryFn: () => getLeaveForm(date), gcTime: 0 });
  // Course names for the period toggles (best effort; the form only marks which periods have class).
  const semesters = useQuery({ queryKey: ['legacy', 'schedule-semesters'], queryFn: getScheduleSemesters });
  const yms = semesters.data?.find((s) => s.selected)?.value;
  const schedule = useQuery({ queryKey: ['legacy', 'schedule', yms], queryFn: () => getSchedule(yms!), enabled: !!yms });
  const weekday = days.find((d) => d.value === date)?.weekday ?? 0;
  const entryFor = (period: string) => {
    const label = /^\d$/.test(period) ? `第${PERIOD_NAMES[Number(period)]}節` : '';
    return schedule.data?.find((e) => e.weekday === weekday && e.period === label);
  };

  const type = form.data?.leaveTypes.find((t) => t.id === typeId);
  const isPublic = typeId === PUBLIC_LEAVE;
  const finalReason = isPublic ? publicReason : reason;

  const submit = useMutation({
    mutationFn: () => applyLeave({ form: form.data!, type: type!, periods, reason: finalReason, attachment }),
  });

  const chooseDate = (value: string) => {
    setDate(value);
    setPeriods([]);
  };

  const setSelected = (ps: string[], on: boolean) =>
    setPeriods((cur) => {
      const next = on ? [...cur, ...ps] : cur.filter((x) => !ps.includes(x));
      return form.data!.periodOrder.filter((x) => next.includes(x));
    });
  const selectionOf = (ps: string[]) => {
    const n = ps.filter((p) => periods.includes(p)).length;
    return n === 0 ? false : n === ps.length ? true : ('mixed' as const);
  };
  const toggleAll = (ps: string[]) => setSelected(ps, selectionOf(ps) !== true);

  const classes = form.data ? groupClasses(form.data.scheduled, form.data.periodOrder, entryFor) : [];
  const hasMorning = form.data?.scheduled.some((p) => !/^\d$/.test(p)) ?? false;

  const chooseAttachment = async () => {
    try {
      const file = await pickAttachment(isPublic ? '附加佐證文件' : '附加文件');
      if (file) setAttachment(file);
    } catch (e) {
      Alert.alert('無法讀取檔案', e instanceof Error ? e.message : String(e));
    }
  };

  const confirmAndSubmit = () => {
    if (!form.data || !type) return;
    const summary = `${formatRoc(date)} ${type.name}\n${periods.map(periodLabel).join('、')}\n原因：${finalReason || '（未填）'}`;
    Alert.alert('送出假單？', summary, [
      { text: '取消', style: 'cancel' },
      {
        text: '送出',
        onPress: async () => {
          try {
            const result = await submit.mutateAsync();
            if (result.success === false) {
              Alert.alert('學校系統拒絕了這張假單', result.message);
              return;
            }
            await queryClient.invalidateQueries({ queryKey: ['legacy', 'leaves'] });
            Alert.alert(
              result.success ? '假單已送出' : '已送出',
              result.message || '請到假單列表確認是否成功。',
              [{ text: '好', onPress: () => router.back() }],
            );
          } catch (e) {
            Alert.alert('無法送出', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  return (
    <Screen>
      <Section>
        <PickerRow label="日期" icon="calendar" selection={date} options={days} onChange={chooseDate} />
        {form.data && form.data.leaveTypes.length > 0 ? (
          <PickerRow
            label="假別"
            icon="tag"
            selection={typeId}
            options={form.data.leaveTypes.map((t) => ({ label: t.name, value: t.id }))}
            onChange={setTypeId}
          />
        ) : null}
      </Section>

      <Section
        title={periods.length ? `節次 · 已選 ${periods.length} 節` : '節次'}
        footer={
          hasMorning
            ? '點課程選整堂課，再取消不需要請的節次。早自習或朝會不能單獨請假，要和第 1 節一起請。'
            : '點課程選整堂課，再取消不需要請的節次。'
        }>
        {form.isPending ? (
          <LoadingRow />
        ) : form.error ? (
          <ActionRow title={`無法載入：${form.error.message}（點此重試）`} onPress={() => form.refetch()} />
        ) : form.data.scheduled.length === 0 ? (
          <TextRow body="這天沒有課，不需要請假。" tone="secondary" />
        ) : (
          <>
            {classes.length > 1 ? (
              <SelectRow
                title="整天"
                subtitle={`${form.data.scheduled.length} 節課`}
                selected={selectionOf(form.data.scheduled)}
                onPress={() => toggleAll(form.data!.scheduled)}
              />
            ) : null}
            {classes.flatMap((c) => {
              const state = selectionOf(c.periods);
              const rows = [
                <SelectRow
                  key={`${date}-${c.periods[0]}`}
                  title={c.title}
                  subtitle={c.subtitle}
                  selected={state}
                  onPress={() => toggleAll(c.periods)}
                />,
              ];
              // Picked a multi-period class: show its periods so one can be left out.
              if (state && c.periods.length > 1) {
                for (const p of c.periods) {
                  rows.push(
                    <SelectRow
                      key={`${date}-${c.periods[0]}-${p}`}
                      nested
                      title={periodLabel(p)}
                      subtitle={formatTimeRange(entryFor(p)?.time ?? '') || undefined}
                      selected={periods.includes(p)}
                      onPress={() => setSelected([p], !periods.includes(p))}
                    />,
                  );
                }
              }
              return rows;
            })}
          </>
        )}
      </Section>

      <Section title="原因" footer={isPublic ? '公假只能使用這四種事由，並且必須附上佐證文件。' : undefined}>
        {isPublic ? (
          <PickerRow
            label="事由"
            selection={publicReason}
            options={[
              { label: '請選擇', value: '' },
              ...(form.data?.publicLeaveReasons ?? []).map((r) => ({ label: r, value: r })),
            ]}
            onChange={setPublicReason}
          />
        ) : (
          <TextFieldRow
            state={reasonState}
            onChangeText={setReason}
            placeholder="請假原因"
            autoCapitalize
            maxLength={170}
          />
        )}
        <NavRow
          title={attachment ? attachment.name : isPublic ? '附加佐證文件（必填）' : '附加文件（選填）'}
          subtitle={attachment ? undefined : '拍照、從照片選擇，或 PDF 檔案'}
          icon="paperclip"
          detail={attachment ? '更換' : undefined}
          onPress={chooseAttachment}
        />
      </Section>

      <Section footer="送出後會直接交給學校的舊系統，由導師與教官審核。">
        <ActionRow
          title="送出假單"
          icon="paperplane"
          onPress={confirmAndSubmit}
          loading={submit.isPending}
          disabled={!form.data || !type || periods.length === 0 || !finalReason.trim() || (isPublic && !attachment)}
        />
      </Section>
    </Screen>
  );
}
