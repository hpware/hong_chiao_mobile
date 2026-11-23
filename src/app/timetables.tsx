import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';

import { ActionRow, Loading, LoadingRow, PickerRow, Screen, Section, Status, TextRow, WideRow } from '@/components/native';
import { useCalendarColors, WeekView } from '@/components/week-grid';
import { getClasses, getClassTimetable, getClassTimetableOptions, getTeacherTimetable, getTeacherTimetableOptions, type TimetableCourse } from '@/lib/old/api';
import { type CalendarBlock, coursePalette, hourRange, weekBlocks } from '@/lib/old/schedule';
import type { ScheduleEntry } from '@/lib/old/parsers';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const NONE = '';

/** 系所班級課表查詢 (AG304) and 教師課表查詢 (AG300): any class's or teacher's week. */
export default function TimetablesScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<'class' | 'teacher'>(params.mode === 'teacher' ? 'teacher' : 'class');

  return (
    <>
      <Stack.Screen options={{ title: mode === 'class' ? '班級課表' : '教師課表' }} />
      {mode === 'class' ? <ClassTimetable onMode={setMode} /> : <TeacherTimetable onMode={setMode} />}
    </>
  );
}

const MODES = [
  { label: '班級', value: 'class' },
  { label: '教師', value: 'teacher' },
] as const;

function ClassTimetable({ onMode }: { onMode: (m: 'class' | 'teacher') => void }) {
  const options = useQuery({
    queryKey: ['legacy', 'class-tt-options'],
    queryFn: getClassTimetableOptions,
    staleTime: Infinity,
  });
  const [yms, setYms] = useState<string>();
  const [unit, setUnit] = useState(NONE);
  const [classId, setClassId] = useState(NONE);
  const semester = yms ?? options.data?.semesters.find((s) => s.selected)?.value ?? options.data?.semesters.at(-1)?.value ?? '';

  const classes = useQuery({
    queryKey: ['legacy', 'classes', semester, unit],
    queryFn: () => getClasses(semester, unit),
    enabled: !!semester && !!unit,
  });
  const timetable = useQuery({
    queryKey: ['legacy', 'class-tt', semester, classId],
    queryFn: () => getClassTimetable(semester, classId),
    enabled: !!semester && !!classId,
  });

  if (options.isPending) return <Loading />;
  if (options.error) return <Status title="無法載入" message={errorText(options.error)} actionTitle="重試" onAction={() => options.refetch()} />;

  return (
    <Screen onRefresh={() => timetable.refetch()}>
      <Section>
        <PickerRow label="查詢" icon="person.2" selection="class" options={MODES} onChange={onMode} />
        <PickerRow
          label="學期"
          icon="calendar"
          selection={semester}
          options={[...options.data.semesters].reverse().map((s) => ({ label: s.label, value: s.value }))}
          onChange={(v) => {
            setYms(v);
            setClassId(NONE);
          }}
        />
        <PickerRow
          label="系所"
          icon="building.2"
          selection={unit}
          options={[
            { label: '請選擇', value: NONE },
            ...options.data.units.map((u) => ({
              label: u.label,
              value: u.value,
            })),
          ]}
          onChange={(v) => {
            setUnit(v);
            setClassId(NONE);
          }}
        />
        {unit ? (
          classes.isPending ? (
            <LoadingRow />
          ) : (
            <PickerRow
              label="班級"
              icon="person.3"
              selection={classId}
              options={[
                { label: '請選擇', value: NONE },
                ...(classes.data ?? []).map((c) => ({
                  label: c.name,
                  value: c.id,
                })),
              ]}
              onChange={setClassId}
            />
          )
        ) : null}
      </Section>
      {classId ? <TimetableResult query={timetable} show="teacher" source={{ source: 'class', yms: semester, classId }} /> : null}
    </Screen>
  );
}

function TeacherTimetable({ onMode }: { onMode: (m: 'class' | 'teacher') => void }) {
  const [yms, setYms] = useState<string>();
  const [unit, setUnit] = useState(NONE);
  const [teacher, setTeacher] = useState(NONE);
  const base = useQuery({
    queryKey: ['legacy', 'teacher-tt-options'],
    queryFn: () => getTeacherTimetableOptions(),
    staleTime: Infinity,
  });
  const semester = yms ?? base.data?.semesters.find((s) => s.selected)?.value ?? base.data?.semesters.at(-1)?.value ?? '';
  const teachers = useQuery({
    queryKey: ['legacy', 'teachers', semester, unit],
    queryFn: () => getTeacherTimetableOptions(semester, unit),
    enabled: !!semester && !!unit,
  });
  const timetable = useQuery({
    queryKey: ['legacy', 'teacher-tt', semester, unit, teacher],
    queryFn: () => getTeacherTimetable(semester, unit, teacher),
    enabled: !!semester && !!unit && !!teacher,
  });

  if (base.isPending) return <Loading />;
  if (base.error) return <Status title="無法載入" message={errorText(base.error)} actionTitle="重試" onAction={() => base.refetch()} />;

  return (
    <Screen onRefresh={() => timetable.refetch()}>
      <Section>
        <PickerRow label="查詢" icon="person.2" selection="teacher" options={MODES} onChange={onMode} />
        <PickerRow
          label="學期"
          icon="calendar"
          selection={semester}
          options={[...base.data.semesters].reverse().map((s) => ({ label: s.label, value: s.value }))}
          onChange={(v) => {
            setYms(v);
            setTeacher(NONE);
          }}
        />
        <PickerRow
          label="系所"
          icon="building.2"
          selection={unit}
          options={[{ label: '請選擇', value: NONE }, ...base.data.units.map((u) => ({ label: u.label, value: u.value }))]}
          onChange={(v) => {
            setUnit(v);
            setTeacher(NONE);
          }}
        />
        {unit ? (
          teachers.isPending ? (
            <LoadingRow />
          ) : (
            <PickerRow
              label="教師"
              icon="person"
              selection={teacher}
              options={[
                { label: '請選擇', value: NONE },
                ...(teachers.data?.teachers ?? []).map((t) => ({
                  label: t.label,
                  value: t.value,
                })),
              ]}
              onChange={setTeacher}
            />
          )
        ) : null}
      </Section>
      {teacher ? <TimetableResult query={timetable} show="class" source={{ source: 'teacher', yms: semester, unit, teacher }} /> : null}
    </Screen>
  );
}

type TimetableQuery = {
  isPending: boolean;
  error: Error | null;
  data?: {
    courses: TimetableCourse[];
    entries: ScheduleEntry[];
    empty: boolean;
  };
  refetch: () => unknown;
};

/** The week, day by day, then every course with its credits. */
function TimetableResult({ query, show, source }: { query: TimetableQuery; show: 'teacher' | 'class'; source: Record<string, string> }) {
  if (query.isPending) {
    return (
      <Section>
        <LoadingRow />
      </Section>
    );
  }
  if (query.error || !query.data) {
    return (
      <Section>
        <ActionRow title={`無法載入：${errorText(query.error)}（點此重試）`} onPress={() => void query.refetch()} />
      </Section>
    );
  }
  if (query.data.empty) {
    return (
      <Section>
        <TextRow body="這學期沒有排課資料。" tone="secondary" />
      </Section>
    );
  }
  const data = query.data;
  // Same course sheet as the 課表 tab; it reads this timetable from the query cache.
  const open = (b: Pick<CalendarBlock, 'course'> & Partial<CalendarBlock>) =>
    router.push({
      pathname: '/course',
      params: {
        ...source,
        course: b.course,
        ...(b.weekday === undefined ? {} : { weekday: String(b.weekday), start: b.start }),
      },
    });
  return (
    <>
      <Section title="週課表">
        <WideRow>
          <TimetableGrid entries={data.entries} onOpen={open} />
        </WideRow>
      </Section>
      <Section title="課程" footer={`共 ${data.courses.length} 門課`}>
        {data.courses.map((c, i) => (
          <TextRow
            key={i}
            title={c.course}
            meta={[c.time, c.required, c.credits && `${c.credits} 學分`].filter(Boolean).join(' · ')}
            body={[show === 'teacher' ? c.teacher : c.className, c.room].filter(Boolean).join(' · ') || undefined}
          />
        ))}
      </Section>
    </>
  );
}

function TimetableGrid({ entries, onOpen }: { entries: ScheduleEntry[]; onOpen: (b: CalendarBlock) => void }) {
  const c = useCalendarColors();
  const blocks = useMemo(() => weekBlocks(entries), [entries]);
  const colorFor = useMemo(() => coursePalette(blocks, c.dark), [blocks, c.dark]);
  const range = useMemo(() => hourRange(blocks), [blocks]);
  return <WeekView c={c} blocks={blocks} range={range} colorFor={colorFor} onOpen={onOpen} />;
}
