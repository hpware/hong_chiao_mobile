import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { BottomSheet, DatePicker, Host, VStack } from '@expo/ui/swift-ui';
import { datePickerStyle, environment, padding, tint } from '@expo/ui/swift-ui/modifiers';

import { Status } from '@/components/native';
import { type Colors, DAY_LABELS, GUTTER, gridStyles, HourLines, type Mark, MarkBadge, NowLine, useCalendarColors as useColors, WeekView } from '@/components/week-grid';
import { dateToRoc, getAbsence, getLeaves, getSchedule, getScheduleSemesters, semesterRange, type LeaveEntry } from '@/lib/old/api';
import { useEnrollment } from '@/lib/enrollment';
import { useLegacyStatus } from '@/lib/old/client';
import {
  addDays,
  type CalendarBlock,
  coursePalette,
  formatMinutes,
  hourRange,
  mondayOf,
  nowMinutes,
  periodNumber,
  todayWeekday,
  weekBlocks,
  ymsForDate,
} from '@/lib/old/schedule';


type Mode = 'day' | 'week';


/** Ticks once a minute so the "now" line and "next class" stay current. */
function useNow() {
  const [now, setNow] = useState(nowMinutes);
  useEffect(() => {
    const id = setInterval(() => setNow(nowMinutes()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}


export default function ScheduleScreen() {
  const ready = useLegacyStatus() === 'ready';
  const c = useColors();
  const now = useNow();

  const [mode, setMode] = useState<Mode>('day');
  const [weekOffset, setWeekOffset] = useState(0);
  const [day, setDay] = useState(todayWeekday);
  const enrollment = useEnrollment();

  const semesters = useQuery({
    queryKey: ['legacy', 'schedule-semesters'],
    queryFn: getScheduleSemesters,
    enabled: ready,
  });
  // The semester follows the week on screen (Aug–Jan: first, Feb–Jul: second).
  const monday = mondayOf(weekOffset);
  const viewedYms = ymsForDate(addDays(monday, 3));
  const viewed = semesters.data?.find((s) => s.value.replace(/\s/g, '') === viewedYms);
  const yms = viewed?.value;
  const schedule = useQuery({
    queryKey: ['legacy', 'schedule', yms],
    queryFn: () => getSchedule(yms!),
    enabled: !!yms,
    staleTime: 30 * 60 * 1000,
  });

  // 缺曠 records (incl. approved leave such as 公假) mark the exact periods; pending/approved
  // leave requests mark whole days until siw turns them into records.
  const absence = useQuery({
    queryKey: ['legacy', 'absence', yms, '00'],
    queryFn: () => getAbsence(yms!),
    enabled: !!yms,
  });
  const leaves = useQuery({
    queryKey: ['legacy', 'leaves-semester', yms],
    queryFn: () => getLeaves(...semesterRange(yms!)),
    enabled: !!yms,
  });
  const periodMarks = useMemo(() => {
    const byDate = new Map<string, Map<number, string>>();
    for (const e of absence.data?.entries ?? []) {
      const n = periodNumber(e.period);
      if (n === null) continue;
      const key = e.date.replace(/\//g, '');
      if (!byDate.has(key)) byDate.set(key, new Map());
      byDate.get(key)!.set(n, e.type);
    }
    return byDate;
  }, [absence.data]);
  const leaveDays = useMemo(() => leaveDayLabels(leaves.data ?? []), [leaves.data]);
  const markFor = (b: CalendarBlock): Mark | undefined => {
    const key = dateToRoc(addDays(monday, b.weekday - 1));
    const types = new Set(
      b.periods.flatMap((p) => {
        const t = periodMarks.get(key)?.get(periodNumber(p) ?? -1);
        return t ? [t] : [];
      }),
    );
    if (types.size) {
      const label = [...types].join('、');
      return { label, kind: /曠|遲|早退/.test(label) ? 'bad' : 'leave' };
    }
    const leave = leaveDays.get(key);
    return leave ? { label: leave, kind: leave.includes('審核') ? 'pending' : 'leave' } : undefined;
  };
  const dayNote = (weekday: number) => leaveDays.get(dateToRoc(addDays(monday, weekday - 1)));

  const blocks = useMemo(() => weekBlocks(schedule.data ?? []), [schedule.data]);
  const colorFor = useMemo(() => coursePalette(blocks, c.dark), [blocks, c.dark]);
  const range = useMemo(() => hourRange(blocks), [blocks]);
  const today = todayWeekday();
  const isThisWeek = weekOffset === 0;

  const openCourse = (b: CalendarBlock) =>
    router.push({ pathname: '/course', params: { course: b.course, yms: yms ?? '', weekday: String(b.weekday), start: b.start } });

  // Jump to the week (and day) of any date picked from the calendar sheet.
  const goToDate = (date: Date) => {
    const wd = date.getDay() === 0 ? 7 : date.getDay();
    const target = addDays(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12), 1 - wd);
    setWeekOffset(Math.round((target.getTime() - mondayOf(0).getTime()) / (7 * 86_400_000)));
    setDay(wd);
  };

  const goToday = () => {
    setWeekOffset(0);
    setDay(today);
  };

  if (!ready) {
    return (
      <Status
        title="需要舊系統密碼"
        icon="key"
        message="課表來自舊系統（siw）。輸入一次舊系統密碼，之後就不會再問。"
        actionTitle="輸入密碼"
        onAction={() => router.push('/legacy-password')}
      />
    );
  }

  const error = semesters.error ?? schedule.error;
  const [vy, vs] = viewedYms.split(',');
  const semesterLabel = viewed?.label ?? `${vy}學年度第${vs}學期`;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: '課表', headerLargeTitle: false }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button accessibilityLabel="今天" onPress={goToday}>
          今天
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        stickyHeaderIndices={[0]}
        refreshControl={
          <RefreshControl
            refreshing={schedule.isRefetching}
            onRefresh={() => void semesters.refetch().then(() => schedule.refetch())}
          />
        }>
        <View style={{ backgroundColor: c.bg, paddingBottom: 8 }}>
          <Segmented c={c} value={mode} onChange={setMode} />
          <WeekHeader
            c={c}
            monday={monday}
            mode={mode}
            day={day}
            today={isThisWeek ? today : 0}
            busyDays={new Set(blocks.map((b) => b.weekday))}
            onPrev={() => setWeekOffset((w) => w - 1)}
            onNext={() => setWeekOffset((w) => w + 1)}
            onPickDay={(d) => {
              setDay(d);
              setMode('day');
            }}
            subtitle={semesterLabel}
            selected={addDays(monday, day - 1)}
            onPickDate={goToDate}
          />
        </View>

        {error ? (
          <Message
            c={c}
            icon="exclamationmark.triangle"
            title="無法載入課表"
            body={error.message}
            action="重試"
            onAction={() => void semesters.refetch().then(() => schedule.refetch())}
          />
        ) : semesters.data && !yms ? (
          <Message
            c={c}
            icon="calendar"
            title={`${semesterLabel}沒有課表`}
            body={
              enrollment.first && Number(vy) * 10 + Number(vs) < enrollment.first.year * 10 + enrollment.first.semi
                ? '這週在你入學之前。'
                : '學校還沒有排這學期的課。'
            }
            action="回到今天"
            onAction={goToday}
          />
        ) : !schedule.data ? (
          <Message c={c} icon="hourglass" title="載入中…" />
        ) : blocks.length === 0 ? (
          <Message c={c} icon="calendar" title="這學期沒有排課" body="若有誤，請下拉重新整理。" />
        ) : mode === 'day' ? (
          <DayView
            c={c}
            blocks={blocks.filter((b) => b.weekday === day)}
            range={range}
            now={isThisWeek && day === today ? now : null}
            colorFor={colorFor}
            onOpen={openCourse}
            markFor={markFor}
            note={dayNote(day)}
            dateLabel={`${addDays(monday, day - 1).getMonth() + 1}月${addDays(monday, day - 1).getDate()}日 週${DAY_LABELS[day]}`}
          />
        ) : (
          <WeekView
            c={c}
            blocks={blocks}
            range={range}
            monday={monday}
            today={isThisWeek ? today : 0}
            now={now}
            colorFor={colorFor}
            onOpen={openCourse}
            markFor={markFor}
          />
        )}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------

function Segmented({ c, value, onChange }: { c: Colors; value: Mode; onChange: (m: Mode) => void }) {
  const items: { key: Mode; label: string }[] = [
    { key: 'day', label: '日' },
    { key: 'week', label: '週' },
  ];
  return (
    <View style={[styles.segmented, { backgroundColor: c.surface }]}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Pressable
            key={it.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(it.key)}
            style={[styles.segment, on && { backgroundColor: c.dark ? '#3A3A3C' : '#FFFFFF' }, on && styles.segmentOn]}>
            <Text style={{ color: c.label, fontWeight: on ? '600' : '400', fontSize: 14 }}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function WeekHeader({
  c,
  monday,
  mode,
  day,
  today,
  busyDays,
  onPrev,
  onNext,
  onPickDay,
  subtitle,
  selected,
  onPickDate,
}: {
  c: Colors;
  monday: Date;
  mode: Mode;
  day: number;
  today: number;
  busyDays: Set<number>;
  onPrev: () => void;
  onNext: () => void;
  onPickDay: (d: number) => void;
  subtitle?: string;
  selected: Date;
  onPickDate: (date: Date) => void;
}) {
  const [picking, setPicking] = useState(false);
  const sunday = addDays(monday, 6);
  const title =
    monday.getMonth() === sunday.getMonth()
      ? `${monday.getFullYear()}年${monday.getMonth() + 1}月`
      : `${monday.getMonth() + 1}月 – ${sunday.getMonth() + 1}月`;
  return (
    <View>
      <View style={styles.monthRow}>
        <Pressable
          style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1 })}
          onPress={() => setPicking(true)}
          accessibilityRole="button"
          accessibilityLabel={`${title}，選擇日期`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.monthTitle, { color: c.label }]}>{title}</Text>
            <SymbolView name={{ ios: 'chevron.down', android: 'keyboard_arrow_down' }} size={13} weight="semibold" tintColor={c.accent} />
          </View>
          {subtitle ? <Text style={{ color: c.secondary, fontSize: 13 }}>{subtitle}</Text> : null}
        </Pressable>
        <Host style={{ position: 'absolute', width: 1, height: 1 }}>
          <BottomSheet isPresented={picking} onIsPresentedChange={setPicking} fitToContents>
            <VStack modifiers={[padding({ horizontal: 16, top: 24, bottom: 32 })]}>
              <DatePicker
                selection={selected}
                displayedComponents={['date']}
                modifiers={[
                  datePickerStyle('graphical'),
                  tint(c.accent),
                  environment('locale', 'zh_Hant_TW'),
                  environment('timeZone', 'Asia/Taipei'),
                ]}
                onDateChange={(d) => {
                  setPicking(false);
                  onPickDate(d);
                }}
              />
            </VStack>
          </BottomSheet>
        </Host>
        <IconButton c={c} icon="chevron.left" label="上一週" onPress={onPrev} />
        <IconButton c={c} icon="chevron.right" label="下一週" onPress={onNext} />
      </View>
      {mode === 'day' ? (
        <View style={styles.strip}>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => {
            const date = addDays(monday, d - 1);
            const selected = d === day;
            const isToday = d === today;
            return (
              <Pressable
                key={d}
                onPress={() => onPickDay(d)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${date.getMonth() + 1}月${date.getDate()}日 週${DAY_LABELS[d]}${busyDays.has(d) ? '，有課' : ''}`}
                style={styles.stripCell}>
                <Text style={{ color: d >= 6 ? c.tertiary : c.secondary, fontSize: 12, marginBottom: 4 }}>
                  {DAY_LABELS[d]}
                </Text>
                <View
                  style={[
                    styles.dateBubble,
                    selected && { backgroundColor: isToday ? c.accent : c.label },
                  ]}>
                  <Text
                    style={{
                      fontSize: 17,
                      fontWeight: selected || isToday ? '600' : '400',
                      color: selected ? (isToday ? c.onAccent : c.bg) : isToday ? c.accent : c.label,
                      fontVariant: ['tabular-nums'],
                    }}>
                    {date.getDate()}
                  </Text>
                </View>
                <View style={[styles.dot, { backgroundColor: busyDays.has(d) ? c.tertiary : 'transparent' }]} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.hairline }} />
    </View>
  );
}

function IconButton({ c, icon, label, onPress }: { c: Colors; icon: 'chevron.left' | 'chevron.right'; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={styles.iconButton}>
      <SymbolView name={{ ios: icon, android: icon === 'chevron.left' ? 'chevron_left' : 'chevron_right' }} size={17} tintColor={c.accent} weight="semibold" fallback={<Text style={{ color: c.accent, fontSize: 20 }}>{icon === 'chevron.left' ? '‹' : '›'}</Text>} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Day: an hour timeline with the day's classes, a "now" line and a next-class banner.

const DAY_HOUR = 68;

const EMPTY_ICONS = { 'exclamationmark.triangle': 'warning', hourglass: 'hourglass_empty', calendar: 'calendar_month', 'sun.max': 'light_mode' } as const;

function DayView({
  c,
  blocks,
  range,
  now,
  colorFor,
  onOpen,
  markFor,
  note,
  dateLabel,
}: {
  c: Colors;
  blocks: CalendarBlock[];
  range: [number, number];
  now: number | null;
  colorFor: (course: string) => { fill: string; ink: string };
  onOpen: (b: CalendarBlock) => void;
  markFor: (b: CalendarBlock) => Mark | undefined;
  /** A leave request covering this day (審核中 / 已准假). */
  note?: string;
  dateLabel: string;
}) {
  const [from, to] = range;
  const y = (min: number) => ((min - from * 60) / 60) * DAY_HOUR;
  const current = now === null ? undefined : blocks.find((b) => now >= b.startMin && now < b.endMin);
  const next = now === null ? undefined : blocks.find((b) => b.startMin > now);
  const periods = blocks.reduce((n, b) => n + b.periods.length, 0);

  return (
    <View>
      <View style={styles.dayHeading}>
        <Text style={{ color: c.label, fontSize: 15, fontWeight: '600' }}>{dateLabel}</Text>
        <Text style={{ color: c.secondary, fontSize: 13 }}>
          {blocks.length ? `${blocks.length} 門課 · ${periods} 節` : '沒有課'}
        </Text>
      </View>
      {note ? (
        <View style={{ paddingHorizontal: 16 }}>
          <MarkBadge c={c} mark={{ label: note, kind: note.includes('審核') ? 'pending' : 'leave' }} />
        </View>
      ) : null}

      {now !== null && (current || next) ? (
        <NowBanner c={c} block={(current ?? next)!} live={!!current} now={now} color={colorFor((current ?? next)!.course)} onPress={() => onOpen((current ?? next)!)} />
      ) : null}

      {blocks.length === 0 ? (
        <Message c={c} icon="sun.max" title="今天沒有課" body="好好休息。" compact />
      ) : (
        <View style={{ height: (to - from) * DAY_HOUR + 24, marginTop: 8 }}>
          <HourLines c={c} from={from} to={to} hour={DAY_HOUR} />
          {blocks.map((b, i) => {
            const col = colorFor(b.course);
            const top = y(b.startMin);
            const height = Math.max(y(b.endMin) - top - 3, 28);
            const past = now !== null && now >= b.endMin;
            const mark = markFor(b);
            return (
              <Pressable
                key={i}
                onPress={() => onOpen(b)}
                accessibilityRole="button"
                accessibilityLabel={`${b.course}，${b.start} 到 ${b.end}${b.classroom ? `，${b.classroom}` : ''}${b.teacher ? `，${b.teacher}` : ''}${mark ? `，${mark.label}` : ''}`}
                style={({ pressed }) => [
                  styles.event,
                  { top: top + 12, height, left: GUTTER + 8, right: 16, backgroundColor: col.fill, borderLeftColor: col.ink, opacity: pressed ? 0.7 : past ? 0.55 : 1 },
                ]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.eventTitle, { color: col.ink, flexShrink: 1 }]} numberOfLines={1}>
                    {b.course}
                  </Text>
                  {mark ? <MarkBadge c={c} mark={mark} /> : null}
                </View>
                <Text style={{ color: col.ink, fontSize: 13, opacity: 0.85, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
                  {b.start}–{b.end} · {b.periods.length} 節
                </Text>
                {height > 70 ? (
                  <Text style={{ color: col.ink, fontSize: 13, opacity: 0.85, marginTop: 2 }} numberOfLines={2}>
                    {[b.classroom, b.teacher].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
          {now !== null && now >= from * 60 && now <= to * 60 ? <NowLine c={c} top={y(now) + 12} left={GUTTER} /> : null}
        </View>
      )}
    </View>
  );
}

function NowBanner({
  c,
  block,
  live,
  now,
  color,
  onPress,
}: {
  c: Colors;
  block: CalendarBlock;
  live: boolean;
  now: number;
  color: { fill: string; ink: string };
  onPress: () => void;
}) {
  const mins = live ? block.endMin - now : block.startMin - now;
  const rel = mins >= 60 ? `${Math.floor(mins / 60)} 小時 ${mins % 60} 分` : `${mins} 分鐘`;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.banner, { backgroundColor: c.surface, opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.bannerDot, { backgroundColor: live ? c.now : color.ink }]} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.secondary, fontSize: 12, fontWeight: '600' }}>
          {live ? `上課中 · 還有 ${rel}下課` : `下一堂 · ${rel}後`}
        </Text>
        <Text style={{ color: c.label, fontSize: 16, fontWeight: '600', marginTop: 2 }} numberOfLines={1}>
          {block.course}
        </Text>
        <Text style={{ color: c.secondary, fontSize: 13, marginTop: 1 }} numberOfLines={1}>
          {[`${block.start}–${block.end}`, block.classroom].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

function Message({
  c,
  icon,
  title,
  body,
  action,
  onAction,
  compact,
}: {
  c: Colors;
  icon: 'exclamationmark.triangle' | 'hourglass' | 'calendar' | 'sun.max';
  title: string;
  body?: string;
  action?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: compact ? 40 : 72, paddingHorizontal: 32, gap: 8 }}>
      <SymbolView name={{ ios: icon, android: EMPTY_ICONS[icon] }} size={36} tintColor={c.tertiary} />
      <Text style={{ color: c.label, fontSize: 17, fontWeight: '600', textAlign: 'center' }}>{title}</Text>
      {body ? <Text style={{ color: c.secondary, fontSize: 14, textAlign: 'center' }}>{body}</Text> : null}
      {action && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" style={{ marginTop: 8, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999, backgroundColor: c.accent }}>
          <Text style={{ color: c.onAccent, fontWeight: '600' }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  segmented: { flexDirection: 'row', marginHorizontal: 16, marginTop: 8, borderRadius: 9, padding: 2 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 7 },
  segmentOn: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  monthRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, gap: 4 },
  monthTitle: { fontSize: 20, fontWeight: '700' },
  iconButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  strip: { flexDirection: 'row', paddingHorizontal: 8, paddingTop: 6, paddingBottom: 6 },
  stripCell: { flex: 1, alignItems: 'center' },
  dateBubble: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 4 },
  dayHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 16, paddingTop: 12 },
  banner: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 14, alignItems: 'center' },
  bannerDot: { width: 10, height: 10, borderRadius: 5 },
  event: { position: 'absolute', borderRadius: 10, borderLeftWidth: 4, paddingHorizontal: 10, paddingVertical: 6, overflow: 'hidden' },
  eventTitle: { fontSize: 15, fontWeight: '600' },
});

// ---------------------------------------------------------------------------
// Leave marks


/** Days covered by a leave request that isn't void or rejected: `請假審核中` or `已准假`. */
function leaveDayLabels(leaves: LeaveEntry[]) {
  const out = new Map<string, string>();
  for (const l of leaves) {
    if (l.actionStatus.includes('作廢')) continue;
    const s = l.officerStatus || l.teacherStatus;
    if (s.includes('不')) continue;
    const label = s.includes('核准') && !s.includes('待') ? '已准假' : '請假審核中';
    const start = rocDate(l.startDate);
    const end = rocDate(l.endDate || l.startDate);
    if (!start || !end) continue;
    for (let d = start; d <= end && out.size < 400; d = addDays(d, 1)) {
      const key = dateToRoc(d);
      if (out.get(key) !== '已准假') out.set(key, label);
    }
  }
  return out;
}

function rocDate(compact: string) {
  const m = compact.replace(/\//g, '').match(/^(\d{3})(\d{2})(\d{2})$/);
  return m ? new Date(Number(m[1]) + 1911, Number(m[2]) - 1, Number(m[3]), 12) : null;
}


