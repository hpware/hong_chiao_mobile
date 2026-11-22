import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Loading, LoadingRow, PickerRow, Screen, Section, StatsRow, Status, TextRow, ValueRow } from '@/components/native';
import { useEnrollment } from '@/lib/enrollment';
import { getAbsence, getAbsenceOptions, type AbsenceEntry } from '@/lib/old/api';
import { ABSENCE_PERIODS } from '@/lib/old/parsers';

/** 曠課, 遲到, 早退 count against you; leave (公假, 病假 …) doesn't. */
const isBad = (type: string) => /曠|遲|早退/.test(type);
const toneOf = (type: string) => (isBad(type) ? 'destructive' : 'secondary');

/** `['2','3','4','6']` → `第 2–4、6 節`; non-numbered periods (朝會 …) by name. */
function periodText(periods: string[]) {
  const sorted = [...new Set(periods)].sort((a, b) => ABSENCE_PERIODS.indexOf(a) - ABSENCE_PERIODS.indexOf(b));
  const before = sorted.filter((p) => ABSENCE_PERIODS.indexOf(p) < ABSENCE_PERIODS.indexOf('1'));
  const after = sorted.filter((p) => ABSENCE_PERIODS.indexOf(p) > ABSENCE_PERIODS.indexOf('9'));
  const nums = sorted.filter((p) => /^\d$/.test(p)).map(Number);
  const runs: string[] = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    runs.push(j > i ? `${nums[i]}–${nums[j]}` : String(nums[i]));
    i = j;
  }
  return [...before, ...(runs.length ? [`第 ${runs.join('、')} 節`] : []), ...after.map((p) => `第 ${p} 節`)].join('、');
}

type DayRow = { key: string; month: string; title: string; type: string; periods: string[] };

/** One row per day and type, grouped by month. `115/09/17` → 9月17日 週四. */
function groupByMonth(entries: AbsenceEntry[]) {
  const rows = new Map<string, DayRow>();
  for (const e of entries) {
    const [, m, d] = e.date.split('/').map(Number);
    const key = `${e.date}|${e.type}`;
    const row = rows.get(key) ?? { key, month: `${m} 月`, title: `${m}月${d}日 週${e.weekday}`, type: e.type, periods: [] };
    row.periods.push(e.period);
    rows.set(key, row);
  }
  const months = new Map<string, DayRow[]>();
  for (const r of rows.values()) months.set(r.month, [...(months.get(r.month) ?? []), r]);
  return months;
}

/** 缺曠紀錄 from the legacy system (ak002). */
export default function AbsenceScreen() {
  const options = useQuery({ queryKey: ['legacy', 'absence-options'], queryFn: getAbsenceOptions });
  const enrollment = useEnrollment();
  const [semester, setSemester] = useState<string | null>(null);
  const [type, setType] = useState('00');
  // The newest semester is listed last in this form.
  const yms = semester ?? options.data?.semesters.find((s) => s.selected)?.value ?? options.data?.semesters.at(-1)?.value;
  const absence = useQuery({
    queryKey: ['legacy', 'absence', yms, type],
    queryFn: () => getAbsence(yms!, type),
    enabled: !!yms,
  });

  if (options.isPending) return <Loading />;
  if (options.error) {
    return <Status title="無法載入" message={options.error.message} actionTitle="重試" onAction={() => options.refetch()} />;
  }

  const entries = absence.data?.entries ?? [];
  const totals = new Map<string, number>();
  for (const e of entries) totals.set(e.type, (totals.get(e.type) ?? 0) + 1);
  const months = groupByMonth(entries);

  return (
    <Screen onRefresh={() => absence.refetch()}>
      <Section>
        <PickerRow
          label="學期"
          icon="calendar"
          selection={yms ?? ''}
          options={enrollment.filterYms([...options.data.semesters].reverse()).map((s) => ({ label: s.label, value: s.value }))}
          onChange={setSemester}
        />
        {options.data.types.length > 0 ? (
          <PickerRow
            label="類別"
            icon="line.3.horizontal.decrease"
            selection={type}
            options={options.data.types.map((t) => ({ label: t.label, value: t.value }))}
            onChange={setType}
          />
        ) : null}
      </Section>

      {absence.isPending ? (
        <Section>
          <LoadingRow />
        </Section>
      ) : absence.error ? (
        <Section>
          <TextRow body={`無法載入：${absence.error.message}`} tone="destructive" />
        </Section>
      ) : entries.length === 0 ? (
        <Section>
          <TextRow body={absence.data.emptyMessage || '這學期沒有缺曠紀錄。'} tone="secondary" />
        </Section>
      ) : (
        <>
          <Section title="總計">
            {totals.size <= 4 ? (
              <StatsRow
                stats={[...totals.entries()].map(([t, n]) => ({ label: t, value: `${n} 節`, tone: isBad(t) ? 'destructive' : undefined }))}
              />
            ) : (
              [...totals.entries()].map(([t, n]) => <ValueRow key={t} label={t} value={`${n} 節`} tone={toneOf(t)} />)
            )}
          </Section>
          {[...months.entries()].map(([month, rows]) => (
            <Section key={month} title={month}>
              {rows.map((r) => (
                <ValueRow
                  key={r.key}
                  label={r.title}
                  subtitle={`${periodText(r.periods)} · 共 ${r.periods.length} 節`}
                  value={r.type}
                  tone={toneOf(r.type)}
                />
              ))}
            </Section>
          ))}
        </>
      )}
    </Screen>
  );
}
