import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';

import type { Href } from 'expo-router';
import { LoadingRow, NavRow, Screen, Section, ValueRow } from '@/components/native';
import { findRoom } from '@/lib/campus';
import { getClassTimetable, getSchedule, getTeacherTimetable } from '@/lib/old/api';
import { WEEKDAY_NAMES, weekBlocks } from '@/lib/old/schedule';

/**
 * Pushing from inside this form sheet would stack the screen inside the sheet (no back button).
 * Close the sheet first, then open the screen normally on the main stack.
 */
function openFromSheet(path: Href) {
  router.back();
  setTimeout(() => router.push(path), 350);
}

type Params = {
  course: string;
  yms: string;
  weekday?: string;
  start?: string;
  /** Set when opened from 班級課表 / 教師課表 instead of the user's own schedule. */
  source?: 'class' | 'teacher';
  classId?: string;
  unit?: string;
  teacher?: string;
};

/** The same queries (and cache keys) the 課表 tab and timetables screen use. */
function useCourseSource(p: Params) {
  return useQuery({
    queryKey:
      p.source === 'class'
        ? ['legacy', 'class-tt', p.yms, p.classId]
        : p.source === 'teacher'
          ? ['legacy', 'teacher-tt', p.yms, p.unit, p.teacher]
          : ['legacy', 'schedule', p.yms],
    queryFn: async () =>
      p.source === 'class'
        ? await getClassTimetable(p.yms, p.classId ?? '')
        : p.source === 'teacher'
          ? await getTeacherTimetable(p.yms, p.unit ?? '', p.teacher ?? '')
          : { entries: await getSchedule(p.yms), courses: [] },
    enabled: !!p.yms,
    staleTime: 30 * 60 * 1000,
  });
}

/** Course details sheet, opened from a class on the 課表 tab, 首頁 or a class/teacher timetable. */
export default function CourseScreen() {
  const params = useLocalSearchParams<Params>();
  const { course, weekday, start, source } = params;
  const schedule = useCourseSource(params);

  const className = schedule.data?.courses.find((c) => c.course === course)?.className;
  const meetings = weekBlocks(schedule.data?.entries ?? []).filter((b) => b.course === course);
  const tapped = meetings.find((b) => String(b.weekday) === weekday && b.start === start) ?? meetings[0];
  const teachers = [...new Set(meetings.map((b) => b.teacher).filter(Boolean))];
  const rooms = [...new Set(meetings.map((b) => b.classroom).filter(Boolean))];
  const periods = meetings.reduce((n, b) => n + b.periods.length, 0);

  return (
    <>
      <Stack.Screen options={{ title: course }} />
      <Screen>
        {!schedule.data ? (
          <Section>
            <LoadingRow />
          </Section>
        ) : (
          <>
            {tapped ? (
              <Section title="這堂課">
                <ValueRow label="時間" value={`${WEEKDAY_NAMES[tapped.weekday]} ${tapped.start}–${tapped.end}`} icon="clock" />
                <ValueRow label="節次" value={tapped.periods.join('、')} icon="list.number" />
                {tapped.classroom && findRoom(tapped.classroom) ? (
                  <NavRow
                    title="教室"
                    detail={tapped.classroom}
                    icon="mappin.and.ellipse"
                    onPress={() =>
                      openFromSheet({
                        pathname: '/campus-map',
                        params: { room: tapped.classroom },
                      })
                    }
                  />
                ) : (
                  <ValueRow label="教室" value={tapped.classroom} icon="mappin.and.ellipse" />
                )}
                {source === 'teacher' ? (
                  <ValueRow label="班級" value={className ?? ''} icon="person.3" />
                ) : (
                  <ValueRow label="教師" value={tapped.teacher} icon="person" />
                )}
              </Section>
            ) : null}

            <Section
              title="每週上課"
              footer={`每週共 ${periods} 節${teachers.length > 1 ? ` · 教師：${teachers.join('、')}` : ''}${rooms.length > 1 ? ` · ${rooms.length} 間教室` : ''}`}
            >
              {meetings.map((b, i) => (
                <ValueRow key={i} label={WEEKDAY_NAMES[b.weekday]} subtitle={b.classroom || undefined} value={`${b.start}–${b.end}`} />
              ))}
            </Section>

            {source ? null : (
              <Section>
                <NavRow title="缺曠紀錄" icon="calendar.badge.exclamationmark" onPress={() => openFromSheet('/absence')} />
                <NavRow title="請假" icon="figure.walk.departure" onPress={() => openFromSheet('/leaves')} />
              </Section>
            )}
          </>
        )}
      </Screen>
    </>
  );
}
