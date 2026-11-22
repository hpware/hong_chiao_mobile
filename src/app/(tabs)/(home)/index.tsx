import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import {
  ActionRow,
  ClassRow,
  LoadingRow,
  NavRow,
  Screen,
  Section,
  TextRow,
  ValueRow,
} from '@/components/native';
import { SystemStatusSection } from '@/components/system-status';
import { openInApp } from '@/lib/browser';
import { getUserName } from '@/lib/api/auth';
import { getHomeData } from '@/lib/api/home';
import { getSchoolNews, SCHOOL_NEWS_URL } from '@/lib/api/school-site';
import { getAbsence, getMail, getSchedule, getScheduleSemesters } from '@/lib/old/api';
import { courseColor, dayLabel, nowMinutes, todayWeekday, upcomingDay, WEEKDAY_NAMES, weekBlocks } from '@/lib/old/schedule';
import { syncScheduleWidget } from '@/widgets/sync-schedule-widget';
import { useLegacyStatus } from '@/lib/old/client';
import { getSemesterFromDate } from '@/lib/semester';
import { setItem, StorageKeys } from '@/lib/storage';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function HomeScreen() {
  const semester = getSemesterFromDate();

  // 缺曠/請假 live in the legacy system (舊系統); the new portal's counters are always 0 there.
  const legacy = useLegacyStatus() === 'ready';
  // Parcels waiting at the mailroom: worth a line at the top of 首頁.
  const mail = useQuery({ queryKey: ['legacy', 'mail', 'waiting'], queryFn: () => getMail('waiting'), enabled: legacy });
  const absence = useQuery({
    queryKey: ['legacy', 'absence', `${semester.year},${semester.sem}`, '00'],
    queryFn: () => getAbsence(`${semester.year},${semester.sem}`),
    enabled: legacy,
  });
  const home = useQuery({
    queryKey: ['home', 'data', semester.year, semester.sem],
    queryFn: () => getHomeData(semester.year, semester.sem),
    enabled: !legacy,
  });
  const scheduleSemesters = useQuery({
    queryKey: ['legacy', 'schedule-semesters'],
    queryFn: getScheduleSemesters,
    enabled: legacy,
  });
  const yms = (scheduleSemesters.data?.find((s) => s.selected) ?? scheduleSemesters.data?.[0])?.value;
  const schedule = useQuery({
    queryKey: ['legacy', 'schedule', yms],
    queryFn: () => getSchedule(yms!),
    enabled: !!yms,
    staleTime: 30 * 60 * 1000,
  });
  const weekday = todayWeekday();
  const now = nowMinutes();
  const upcoming = upcomingDay(weekBlocks(schedule.data ?? []), weekday, now);
  const dark = useColorScheme() === 'dark';

  // Keep the 課表 widget (home + lock screen) in sync with the current semester's classes.
  useEffect(() => {
    if (schedule.data) void syncScheduleWidget(schedule.data);
  }, [schedule.data]);
  const scheduleError = scheduleSemesters.error ?? schedule.error;

  const news = useQuery({ queryKey: ['school-site', 'news'], queryFn: getSchoolNews, staleTime: 10 * 60 * 1000 });
  const name = useQuery({ queryKey: ['user', 'name'], queryFn: getUserName, staleTime: Infinity });

  useEffect(() => {
    if (name.data) void setItem(StorageKeys.userName, name.data);
  }, [name.data]);

  const leaves = home.data?.leaves ?? [];
  const conduct = leaves.find((l) => l.type === '操行分數')?.data;
  const leaveRows = leaves.filter((l) => l.type !== '操行分數');

  // Periods per type (缺曠, 事假, 病假, 遲到 …) from the legacy absence records.
  const counts = new Map<string, number>();
  for (const e of absence.data?.entries ?? []) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);

  return (
    <Screen
      onRefresh={() =>
        Promise.all([legacy ? absence.refetch() : home.refetch(), legacy ? schedule.refetch() : null, news.refetch(), name.refetch()])
      }>
      <SystemStatusSection />

      {mail.data && mail.data.length > 0 ? (
        <Section>
          <NavRow
            title={`${mail.data.length} 件信件待領取`}
            subtitle={mail.data.map((m) => m.sender).filter(Boolean).join('、') || undefined}
            icon="envelope.badge"
            onPress={() => router.push('/mail')}
          />
        </Section>
      ) : null}

      {legacy ? (
        <Section
          title={upcoming ? `${upcoming.daysAhead > 1 ? '下一堂課' : dayLabel(upcoming)} · ${WEEKDAY_NAMES[upcoming.weekday]}` : '課表'}
          footer={upcoming && upcoming.daysAhead > 0 ? '今天沒有課了。' : undefined}>
          {scheduleError ? (
            <ActionRow title={`無法載入課表：${errorText(scheduleError)}（點此重試）`} onPress={() => void scheduleSemesters.refetch().then(() => schedule.refetch())} />
          ) : !schedule.data ? (
            <LoadingRow />
          ) : !upcoming ? (
            <TextRow body="這學期沒有排課。" tone="secondary" />
          ) : (
            upcoming.classes.map((b, i) => {
              const today = upcoming.daysAhead === 0;
              const ended = today && now >= b.endMin;
              const live = today && now >= b.startMin && !ended;
              const isNext = today && b === upcoming.classes.find((c) => c.startMin > now);
              const minutes = b.startMin - now;
              return (
                <ClassRow
                  key={i}
                  course={b.course}
                  detail={[`${b.start}–${b.end}`, b.classroom].filter(Boolean).join(' · ')}
                  color={courseColor(b.course, dark).ink}
                  live={live}
                  dimmed={ended}
                  status={
                    ended ? '已結束' : live ? '上課中' : isNext && minutes <= 180 ? (minutes < 60 ? `${minutes} 分鐘後` : `${Math.floor(minutes / 60)} 小時後`) : undefined
                  }
                  onPress={() =>
                    router.push({ pathname: '/course', params: { course: b.course, yms: yms ?? '', weekday: String(b.weekday), start: b.start } })
                  }
                />
              );
            })
          )}
        </Section>
      ) : (
        <Section title="課表">
          <NavRow title="連結舊系統以顯示課表" icon="key" onPress={() => router.push('/legacy-password')} />
        </Section>
      )}

      <Section title="快速存取">
        <NavRow title="獎學金" icon="gift" onPress={() => router.navigate('/scholarships')} />
        <NavRow title="學費" icon="dollarsign.circle" onPress={() => router.navigate('/tuition')} />
        <NavRow title="繳費單" icon="doc.text" onPress={() => router.push('/bill')} />
      </Section>

      {legacy ? (
        <Section title={`${semester.year}-${semester.sem} 學期缺曠與請假`} footer="單位為節數，資料來自舊系統。">
          {absence.isPending ? (
            <LoadingRow />
          ) : absence.error ? (
            <ActionRow title={`無法載入：${errorText(absence.error)}（點此重試）`} onPress={() => absence.refetch()} />
          ) : counts.size === 0 ? (
            <TextRow body="這學期沒有缺曠或請假紀錄。" tone="secondary" />
          ) : (
            [...counts.entries()].map(([type, n]) => <ValueRow key={type} label={type} value={`${n} 節`} />)
          )}
          <NavRow title="缺曠紀錄" icon="calendar.badge.exclamationmark" onPress={() => router.push('/absence')} />
          <NavRow title="請假" icon="figure.walk.departure" onPress={() => router.push('/leaves')} />
        </Section>
      ) : (
        <>
          <Section title={`${semester.year}-${semester.sem} 學期`}>
            {home.isPending ? (
              <LoadingRow />
            ) : home.error ? (
              <ActionRow title={`無法載入：${errorText(home.error)}（點此重試）`} onPress={() => home.refetch()} />
            ) : (
              <>
                <ValueRow label="缺曠紀錄" value={home.data.absent.length} icon="calendar.badge.exclamationmark" />
                <ValueRow label="操行分數" value={conduct} icon="star" />
              </>
            )}
          </Section>
          {leaveRows.length > 0 ? (
            <Section title="請假天數">
              {leaveRows.map((l) => (
                <ValueRow key={l.type} label={l.type} value={Number(l.data) || 0} />
              ))}
            </Section>
          ) : null}
        </>
      )}

      <Section title="學校最新消息" footer="資料來自學校網站（www.tpcu.edu.tw）。">
        {news.isPending ? (
          <LoadingRow />
        ) : news.error ? (
          <ActionRow title={`無法載入消息：${errorText(news.error)}（點此重試）`} onPress={() => news.refetch()} />
        ) : news.data.length === 0 ? (
          <TextRow body="目前沒有消息。" tone="secondary" />
        ) : (
          news.data.slice(0, 8).map((item) => (
            <NavRow
              key={item.url}
              title={item.title}
              subtitle={[item.date, item.unit].filter(Boolean).join(' · ')}
              external
              onPress={() => openInApp(item.url)}
            />
          ))
        )}
        <NavRow title="更多消息" icon="newspaper" external onPress={() => openInApp(SCHOOL_NEWS_URL)} />
      </Section>
    </Screen>
  );
}
