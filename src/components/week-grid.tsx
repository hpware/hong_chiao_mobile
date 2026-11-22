import { useState } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { addDays, type CalendarBlock, formatMinutes } from '@/lib/old/schedule';

export const DAY_LABELS = ['', '一', '二', '三', '四', '五', '六', '日'];
export const GUTTER = 44;
const WEEK_HOUR = 58;

export function useCalendarColors() {
  const dark = useColorScheme() === 'dark';
  return {
    dark,
    bg: dark ? '#000000' : '#FFFFFF',
    surface: dark ? '#1C1C1E' : '#F2F2F7',
    label: dark ? '#FFFFFF' : '#0B0B0F',
    secondary: dark ? '#A1A1A8' : '#5E5E66',
    tertiary: dark ? '#6C6C73' : '#9A9AA2',
    hairline: dark ? '#2C2C2E' : '#E3E3E8',
    accent: dark ? '#7FA8FF' : '#1F57C3',
    onAccent: dark ? '#0B1A36' : '#FFFFFF',
    now: dark ? '#FF6961' : '#D70015',
  };
}
export type Colors = ReturnType<typeof useCalendarColors>;

/** `成306嵌入式系統實驗室` → `成306` (keeps short names whole). */
export function shortRoom(room: string) {
  return room.match(/^\D*\d+/)?.[0] ?? room;
}

/**
 * A Mon–Fri grid (Sat/Sun only when they have classes). Without `monday` the header shows
 * weekday names only, for timetables that aren't tied to a particular week.
 */
export function WeekView({
  c,
  blocks,
  range,
  monday,
  today = 0,
  now = 0,
  colorFor,
  onOpen,
  markFor,
  detail = (b) => (b.classroom ? shortRoom(b.classroom) : ''),
  width: fixedWidth,
}: {
  c: Colors;
  blocks: CalendarBlock[];
  range: [number, number];
  monday?: Date;
  today?: number;
  now?: number;
  colorFor: (course: string) => { fill: string; ink: string };
  onOpen: (b: CalendarBlock) => void;
  markFor?: (b: CalendarBlock) => Mark | undefined;
  /** Second line in each block (defaults to the short room name). */
  detail?: (b: CalendarBlock) => string;
  /** Fixed width, for hosts that can't report layout (e.g. inside a native form row). */
  width?: number;
}) {
  const [from, to] = range;
  const days = [1, 2, 3, 4, 5, ...[6, 7].filter((d) => blocks.some((b) => b.weekday === d))];
  const y = (min: number) => ((min - from * 60) / 60) * WEEK_HOUR;
  const [measured, setMeasured] = useState(0);
  const width = fixedWidth ?? measured;
  const colW = width ? (width - GUTTER - 4) / days.length : 0;

  return (
    <View style={fixedWidth ? { width: fixedWidth } : undefined} onLayout={fixedWidth ? undefined : (e) => setMeasured(e.nativeEvent.layout.width)}>
      <View style={[gridStyles.weekHead, { paddingLeft: GUTTER }]}>
        {days.map((d) => {
          const isToday = d === today;
          return (
            <View key={d} style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
              <Text style={{ color: isToday ? c.accent : c.secondary, fontSize: monday ? 12 : 13, fontWeight: isToday || !monday ? '600' : '400' }}>
                週{DAY_LABELS[d]}
              </Text>
              {monday ? (
                <View style={[gridStyles.weekDate, isToday && { backgroundColor: c.accent }]}>
                  <Text style={{ color: isToday ? c.onAccent : c.label, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                    {addDays(monday, d - 1).getDate()}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={{ height: (to - from) * WEEK_HOUR + 24 }}>
        <HourLines c={c} from={from} to={to} hour={WEEK_HOUR} />
        {days.map((d, i) =>
          i === 0 ? null : (
            <View
              key={`sep${d}`}
              style={{ position: 'absolute', top: 12, bottom: 12, left: GUTTER + i * colW, width: StyleSheet.hairlineWidth, backgroundColor: c.hairline }}
            />
          ),
        )}
        {colW > 0 &&
          blocks
            .filter((b) => days.includes(b.weekday))
            .map((b, i) => {
              const col = colorFor(b.course);
              const top = y(b.startMin) + 12;
              const height = Math.max(y(b.endMin) - y(b.startMin) - 2, 22);
              const mark = markFor?.(b);
              const second = detail(b);
              return (
                <Pressable
                  key={i}
                  onPress={() => onOpen(b)}
                  accessibilityRole="button"
                  accessibilityLabel={`週${DAY_LABELS[b.weekday]} ${b.course}，${b.start} 到 ${b.end}${second ? `，${second}` : ''}`}
                  style={({ pressed }) => [
                    gridStyles.weekEvent,
                    {
                      top,
                      height,
                      left: GUTTER + days.indexOf(b.weekday) * colW + 1.5,
                      width: colW - 3,
                      backgroundColor: col.fill,
                      borderTopColor: col.ink,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}>
                  <Text style={{ color: col.ink, fontSize: 11.5, fontWeight: '600', lineHeight: 14 }} numberOfLines={Math.max(1, Math.floor((height - 18) / 14))}>
                    {b.course}
                  </Text>
                  {mark ? <MarkBadge c={c} mark={mark} small /> : null}
                  {second && height > 40 ? (
                    <Text style={{ color: col.ink, fontSize: 10.5, opacity: 0.85, marginTop: 'auto' }} numberOfLines={1}>
                      {second}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
        {today && days.includes(today) && now >= from * 60 && now <= to * 60 && colW > 0 ? (
          <NowLine c={c} top={y(now) + 12} left={GUTTER + days.indexOf(today) * colW} width={colW} />
        ) : null}
      </View>
    </View>
  );
}

export function HourLines({ c, from, to, hour }: { c: Colors; from: number; to: number; hour: number }) {
  return (
    <>
      {Array.from({ length: to - from + 1 }, (_, i) => (
        <View key={i} style={[gridStyles.hourRow, { top: i * hour + 12 - 7 }]} pointerEvents="none">
          <Text style={[gridStyles.hourLabel, { color: c.tertiary }]}>{formatMinutes((from + i) * 60)}</Text>
          <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.hairline }} />
        </View>
      ))}
    </>
  );
}

export function NowLine({ c, top, left, width }: { c: Colors; top: number; left: number; width?: number }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: top - 4, left: left - 4, ...(width ? { width: width + 4 } : { right: 0 }), flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.now }} />
      <View style={{ flex: 1, height: 2, backgroundColor: c.now }} />
    </View>
  );
}

export type Mark = { label: string; kind: 'leave' | 'pending' | 'bad' };

function markColors(c: Colors, kind: Mark['kind']) {
  if (kind === 'bad') return { bg: c.now, fg: '#FFFFFF' };
  if (kind === 'pending') return { bg: c.dark ? '#5C4A12' : '#F5E3A3', fg: c.dark ? '#F1D57C' : '#5C4300' };
  return { bg: c.dark ? '#17452B' : '#CDEFD9', fg: c.dark ? '#9BE0B5' : '#11502F' };
}

export function MarkBadge({ c, mark, small }: { c: Colors; mark: Mark; small?: boolean }) {
  const col = markColors(c, mark.kind);
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: col.bg, borderRadius: 6, paddingHorizontal: small ? 4 : 6, paddingVertical: small ? 1 : 2, marginTop: small ? 2 : 4 }}>
      <Text style={{ color: col.fg, fontSize: small ? 10 : 12, fontWeight: '700' }} numberOfLines={1}>
        {mark.label}
      </Text>
    </View>
  );
}

export const gridStyles = StyleSheet.create({
  hourRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', height: 14 },
  hourLabel: { width: GUTTER, textAlign: 'right', paddingRight: 8, fontSize: 11, fontVariant: ['tabular-nums'] },
  weekHead: { flexDirection: 'row' },
  weekDate: { marginTop: 2, minWidth: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  weekEvent: { position: 'absolute', borderRadius: 6, borderTopWidth: 3, paddingHorizontal: 4, paddingVertical: 3, overflow: 'hidden' },
});
