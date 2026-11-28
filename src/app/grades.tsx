import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import {
  ActionRow,
  ChartRow,
  Loading,
  LoadingRow,
  NavRow,
  PickerRow,
  Screen,
  Section,
  StatsRow,
  Status,
  TextRow,
  ValueRow,
} from '@/components/native';
import { useEnrollment } from '@/lib/enrollment';
import { getGrades, getMidtermGrades, getSemesterGradeOptions, type GradeEntry } from '@/lib/old/api';

const semesterKey = (s: string) => {
  const m = s.match(/(\d+)學年度第(\d)學期/);
  return m ? Number(m[1]) * 10 + Number(m[2]) : 0;
};

const openLegacy = (fncid: string, title: string) => router.push({ pathname: '/legacy-web', params: { fncid, title } });

/** `114學年度第2學期` → `114-2` */
function shortSemester(s: string) {
  const m = s.match(/(\d+)學年度第(\d)學期/);
  return m ? `${m[1]}-${m[2]}` : s;
}

/** A summary line's number, e.g. `學期總平均 79.7` → `79.7`. */
function summaryValue(items: string[] | undefined, key: string) {
  return items
    ?.find((i) => i.startsWith(key))
    ?.replace(key, '')
    .trim();
}

/** Credit-weighted average of numeric scores. */
function weightedAverage(entries: GradeEntry[]) {
  let points = 0;
  let credits = 0;
  for (const e of entries) {
    const score = Number(e.score);
    const c = Number(e.credits);
    if (e.score === '' || Number.isNaN(score) || !c) continue;
    points += score * c;
    credits += c;
  }
  return credits ? (points / credits).toFixed(1) : '—';
}

const sumCredits = (entries: GradeEntry[]) => entries.reduce((n, e) => n + (Number(e.credits) || 0), 0);

/**
 * 成績, merging three siw pages: 歷年成績 (AG102) for finished semesters, 學期成績查詢 (AG008) for
 * the semester list (so the current one shows before its grades are posted) and 期中成績 (AG009).
 */
export default function GradesScreen() {
  const grades = useQuery({
    queryKey: ['legacy', 'grades'],
    queryFn: getGrades,
    staleTime: 30 * 60 * 1000,
  });
  const options = useQuery({
    queryKey: ['legacy', 'semester-grade-options'],
    queryFn: getSemesterGradeOptions,
    staleTime: 60 * 60 * 1000,
  });
  const midterm = useQuery({
    queryKey: ['legacy', 'midterm'],
    queryFn: getMidtermGrades,
    staleTime: 10 * 60 * 1000,
  });
  const enrollment = useEnrollment();
  const [picked, setPicked] = useState<string | null>(null);

  if (grades.isPending) return <Loading text="正在取得成績…" />;
  if (grades.error) {
    return (
      <Status
        title="無法載入成績"
        message={grades.error.message}
        actionTitle="重試"
        onAction={() => grades.refetch()}
      />
    );
  }

  const { entries, summaries } = grades.data;
  const fromOptions = enrollment.filterYms(options.data ?? []).map((o) => o.label);
  const semesters = [...new Set([...entries.map((e) => e.semester), ...fromOptions])]
    .filter((s) => semesterKey(s) > 0)
    .sort((a, b) => semesterKey(b) - semesterKey(a));
  if (semesters.length === 0) {
    return <Status title="沒有成績資料" icon="graduationcap" message="舊系統目前沒有你的成績紀錄。" />;
  }

  const semester = picked && semesters.includes(picked) ? picked : semesters[0];
  const courses = entries.filter((e) => e.semester === semester);
  const summary = summaries.find((s) => s.semester === semester)?.items;
  const failed = courses.filter((e) => !e.passed).length;
  const earned = summaryValue(summary, '實得學分數') ?? String(sumCredits(courses.filter((e) => e.passed)));
  const attempted = summaryValue(summary, '修習學分數') ?? String(sumCredits(courses));

  // Course types in the order they first appear (共同必修, 專業必修, 專業選修 …).
  const types = [...new Set(courses.map((e) => e.type))];

  const passedAll = entries.filter((e) => e.passed);
  const posted = courses.length > 0;
  const isLatest = semester === semesters[0];

  // Charts ----------------------------------------------------------------
  const scored = courses.filter((e) => e.score !== '' && !Number.isNaN(Number(e.score)));
  const bands = [
    { x: '90+', min: 90, max: 101, color: '#34C759' },
    { x: '80–89', min: 80, max: 90, color: '#30B0C7' },
    { x: '70–79', min: 70, max: 80, color: '#007AFF' },
    { x: '60–69', min: 60, max: 70, color: '#FF9500' },
    { x: '<60', min: -1, max: 60, color: '#FF3B30' },
  ].map((b) => ({
    x: b.x,
    color: b.color,
    y: scored.filter((e) => Number(e.score) >= b.min && Number(e.score) < b.max).length,
  }));
  const creditMix = types.map((t) => ({ x: t, y: sumCredits(courses.filter((e) => e.type === t)) }));
  const trend = [...new Set(entries.map((e) => e.semester))]
    .sort((a, b) => semesterKey(a) - semesterKey(b))
    .map((s) => {
      const avg = Number(
        summaryValue(summaries.find((x) => x.semester === s)?.items, '學期總平均') ??
          weightedAverage(entries.filter((e) => e.semester === s)),
      );
      return { x: shortSemester(s), y: avg };
    })
    .filter((p) => Number.isFinite(p.y));

  return (
    <Screen onRefresh={() => grades.refetch()}>
      <Section>
        <PickerRow
          label="學期"
          icon="calendar"
          selection={semester}
          options={semesters.map((s) => ({
            value: s,
            label: shortSemester(s),
          }))}
          onChange={setPicked}
        />
        {posted ? (
          <StatsRow
            stats={[
              {
                label: '學期平均',
                value: summaryValue(summary, '學期總平均') ?? weightedAverage(courses),
              },
              {
                label: '實得 / 修習學分',
                value: earned === attempted ? earned : `${earned} / ${attempted}`,
              },
              {
                label: '不及格',
                value: String(failed),
                tone: failed ? 'destructive' : undefined,
              },
            ]}
          />
        ) : null}
      </Section>

      {posted && scored.length > 0 ? (
        <Section title="分數分布" footer={`${scored.length} 科有分數`}>
          <ChartRow type="bar" data={bands} height={170} />
        </Section>
      ) : null}

      {posted && creditMix.length > 1 ? (
        <Section title="學分組成">
          <ChartRow type="pie" data={creditMix} height={200} legend />
        </Section>
      ) : null}

      {isLatest ? (
        <Section title="期中成績">
          {midterm.isPending ? (
            <LoadingRow />
          ) : midterm.error ? (
            <ActionRow title={`無法載入：${midterm.error.message}（點此重試）`} onPress={() => midterm.refetch()} />
          ) : midterm.data.entries.length > 0 ? (
            midterm.data.entries.map((e, i) => (
              <ValueRow
                key={`${e.course}-${i}`}
                label={e.course}
                subtitle={[e.required && `${e.required}修`, e.credits && `${e.credits} 學分`].filter(Boolean).join(' · ') || undefined}
                value={e.score ? String(Number(e.score)) : e.note || '—'}
                tone={e.score && Number(e.score) < 60 ? 'destructive' : e.score ? undefined : 'secondary'}
              />
            ))
          ) : (
            <TextRow body={midterm.data.notice || '目前沒有期中成績。'} tone="secondary" />
          )}
          <NavRow title="在舊系統查看期中成績" onPress={() => openLegacy('AG009', '期中成績查詢')} />
        </Section>
      ) : null}

      {!posted ? (
        <Section title="學期成績" footer="學期成績公布後會出現在這裡。">
          <TextRow body="這學期的學期成績尚未公布。" tone="secondary" />
          <NavRow title="在舊系統查看學期成績" onPress={() => openLegacy('AG008', '學期成績查詢')} />
        </Section>
      ) : null}

      {types.map((type) => {
        const list = courses.filter((e) => e.type === type);
        return (
          <Section key={type} title={`${type} · ${sumCredits(list)} 學分`}>
            {list.map((e, i) => (
              <ValueRow
                key={`${e.course}-${i}`}
                label={e.course}
                subtitle={`${e.credits} 學分${e.passed ? '' : ' · 不及格'}`}
                value={e.score || '—'}
                tone={e.passed ? undefined : 'destructive'}
              />
            ))}
          </Section>
        );
      })}

      <Section title="歷年" footer="平均以學分加權計算；紅色虛線為及格分數 60。成績以教務處資料為準。">
        {trend.length > 1 ? (
          <ChartRow type="line" data={trend} height={180} referenceLines={[{ x: trend[0].x, y: 60 }]} />
        ) : null}
        <StatsRow
          stats={[
            { label: '歷年平均', value: weightedAverage(entries) },
            { label: '累計實得學分', value: String(sumCredits(passedAll)) },
            { label: '學期數', value: String(semesters.length) },
          ]}
        />
      </Section>
    </Screen>
  );
}
