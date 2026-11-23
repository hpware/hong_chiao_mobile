import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';

import { Loading, NavRow, Screen, Section, Status } from '@/components/native';
import { getEvaluationCourses } from '@/lib/old/api';

/** 教學評量 (BG052): this semester's courses, each opening its own form. */
export default function EvaluationsScreen() {
  const courses = useQuery({ queryKey: ['legacy', 'evaluations'], queryFn: getEvaluationCourses });

  if (courses.isPending) return <Loading text="正在讀取課程…" />;
  if (courses.error) {
    return <Status title="無法載入教學評量" message={courses.error.message} actionTitle="重試" onAction={() => courses.refetch()} />;
  }
  if (courses.data.length === 0) {
    return <Status title="目前沒有要評量的課程" icon="checkmark.circle" message="教學評量開放期間，這學期的課程會列在這裡。" />;
  }
  const left = courses.data.filter((c) => !c.done).length;
  return (
    <Screen onRefresh={() => courses.refetch()}>
      <Section footer={left ? `還有 ${left} 科未完成。` : '這學期的教學評量都完成了。'}>
        {courses.data.map((c) => (
          <NavRow
            key={`${c.name}-${c.group}-${c.teacher}`}
            title={c.name}
            subtitle={`${c.teacher} · ${c.required} ${c.credits} 學分`}
            detail={c.done ? '已完成' : '未填寫'}
            disabled={c.done || !c.arg}
            onPress={() => router.push({ pathname: '/evaluation', params: { arg: c.arg!, name: c.name } })}
          />
        ))}
      </Section>
    </Screen>
  );
}
