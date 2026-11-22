import { useNativeState } from '@expo/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import {
  ActionRow,
  Loading,
  PickerRow,
  PrimaryButtonRow,
  Screen,
  Section,
  Status,
  TextFieldRow,
  TextRow,
} from '@/components/native';
import { getCourseCategories, getCourseSearchOptions, searchCourses } from '@/lib/old/api';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const ALL = '%';

/** 科目與教師開課資料查詢 (AG203): find who teaches what, when and where. */
export default function CourseSearchScreen() {
  const options = useQuery({ queryKey: ['legacy', 'course-search-options'], queryFn: getCourseSearchOptions, staleTime: Infinity });
  const [yms, setYms] = useState<string>();
  const [degree, setDegree] = useState(ALL);
  const [unit, setUnit] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const subjectState = useNativeState('');
  const teacherState = useNativeState('');
  const gradeState = useNativeState('');
  const [subject, setSubject] = useState('');
  const [teacher, setTeacher] = useState('');
  const [grade, setGrade] = useState('');

  const semester = yms ?? options.data?.semesters.find((s) => s.selected)?.value ?? options.data?.semesters.at(-1)?.value ?? '';
  const categories = useQuery({
    queryKey: ['legacy', 'course-categories', semester],
    queryFn: () => getCourseCategories(semester),
    enabled: !!semester,
    staleTime: Infinity,
  });
  const search = useMutation({ mutationFn: searchCourses });

  if (options.isPending) return <Loading />;
  if (options.error) return <Status title="無法載入" message={errorText(options.error)} actionTitle="重試" onAction={() => options.refetch()} />;

  const submit = () =>
    search.mutate({ yms: semester, degree, unit, grade: grade.trim(), category, subject: subject.trim(), teacher: teacher.trim() });

  return (
    <Screen>
      <Section footer="輸入科目或教師的部分名稱即可，例如「程式」或「胡」。">
        <TextFieldRow state={subjectState} onChangeText={setSubject} label="科目" placeholder="例如 C語言" submitLabel="go" onSubmit={submit} />
        <TextFieldRow state={teacherState} onChangeText={setTeacher} label="教師" placeholder="姓名" submitLabel="go" onSubmit={submit} />
      </Section>

      <Section title="篩選">
        <PickerRow
          label="學期"
          icon="calendar"
          selection={semester}
          options={[...options.data.semesters].reverse().map((s) => ({ label: s.label, value: s.value }))}
          onChange={(v) => {
            setYms(v);
            setCategory(ALL);
          }}
        />
        <PickerRow
          label="學制"
          icon="graduationcap"
          selection={degree}
          options={[{ label: '所有學制', value: ALL }, ...options.data.degrees.filter((d) => d.value !== ALL).map((d) => ({ label: d.label, value: d.value }))]}
          onChange={setDegree}
        />
        <PickerRow
          label="科系"
          icon="building.2"
          selection={unit}
          options={[{ label: '所有科系', value: ALL }, ...options.data.units.filter((u) => u.value !== ALL).map((u) => ({ label: u.label, value: u.value }))]}
          onChange={setUnit}
        />
        <PickerRow
          label="類別"
          icon="tag"
          selection={category}
          options={(categories.data?.length ? categories.data : [{ label: '所有類別', value: ALL }]).map((c) => ({ label: c.label, value: c.value }))}
          onChange={setCategory}
        />
        <TextFieldRow state={gradeState} onChangeText={setGrade} label="年級" placeholder="全部" keyboard="number-pad" maxLength={1} />
      </Section>

      <Section>
        <PrimaryButtonRow title="查詢" onPress={submit} loading={search.isPending} />
      </Section>

      {search.error ? (
        <Section>
          <ActionRow title={`無法查詢：${errorText(search.error)}（點此重試）`} onPress={submit} />
        </Section>
      ) : search.data ? (
        <Section title={`結果 · ${search.data.length} 筆`} footer="開學前課表仍會調整，以學校公告為準。">
          {search.data.length === 0 ? (
            <TextRow body="沒有符合的課程。" tone="secondary" />
          ) : (
            search.data.map((c, i) => (
              <TextRow
                key={`${c.code}-${i}`}
                title={c.course}
                meta={[c.className, c.teacher, `${c.credits} 學分`, c.required, c.category].filter(Boolean).join(' · ')}
                body={[c.time, c.room, c.combined && `合班 ${c.combined}`, c.open !== '開課' && c.open, c.note].filter(Boolean).join(' · ') || undefined}
              />
            ))
          )}
        </Section>
      ) : null}
    </Screen>
  );
}
