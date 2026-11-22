import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import type { ScheduleEntry } from '@/lib/old/parsers';
import { courseColor, dayLabel, upcomingDay, weekBlocks, WEEKDAY_NAMES, type CalendarBlock } from '@/lib/old/schedule';

import type { ScheduleWidgetBlock, ScheduleWidgetProps } from './schedule-widget';

/**
 * The widget module only exists in builds with the widget extension (not Expo Go). Check before
 * importing it: a failed module load is reported as an uncaught error even when caught.
 */
const widgetsAvailable = () => Platform.OS === 'ios' && requireOptionalNativeModule('ExpoWidgets') != null;

const TAIPEI = 8 * 3600_000;
const DAY = 24 * 3600_000;
/** WidgetKit keeps a bounded timeline; a week of class boundaries is well under this. */
const MAX_ENTRIES = 80;

/** Taipei calendar day `offset` days from today: weekday (1–7), midnight (epoch ms) and a label. */
function taipeiDay(offset: number) {
  const t = new Date(Date.now() + TAIPEI);
  const midnight = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + offset) - TAIPEI;
  const d = new Date(midnight + TAIPEI);
  const weekday = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  return { midnight, weekday, month: d.getUTCMonth() + 1, date: d.getUTCDate() };
}

function weekProps(blocks: CalendarBlock[]): ScheduleWidgetBlock[] {
  return blocks.map((b) => ({
    weekday: b.weekday,
    startMin: b.startMin,
    endMin: b.endMin,
    course: b.course,
    room: b.classroom,
    color: courseColor(b.course, false).ink,
    colorDark: courseColor(b.course, true).ink,
  }));
}

function propsAt(blocks: CalendarBlock[], week: ScheduleWidgetBlock[], at: number): ScheduleWidgetProps {
  const local = new Date(at + TAIPEI);
  const weekday = local.getUTCDay() === 0 ? 7 : local.getUTCDay();
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  const day = upcomingDay(blocks, weekday, minute);
  if (!day) return { day: '', date: '', classes: [], message: '這學期沒有排課' };

  const target = new Date(at + TAIPEI + day.daysAhead * DAY);
  const remaining = day.daysAhead === 0 ? day.classes.filter((b) => b.endMin > minute) : day.classes;
  return {
    day: dayLabel(day),
    date: `${target.getUTCMonth() + 1}月${target.getUTCDate()}日 ${WEEKDAY_NAMES[day.weekday]}`,
    classes: remaining.map((b) => ({
      course: b.course,
      time: `${b.start}–${b.end}`,
      room: b.classroom,
      color: courseColor(b.course, false).ink,
      colorDark: courseColor(b.course, true).ink,
      now: day.daysAhead === 0 && b.startMin <= minute && minute < b.endMin,
    })),
    message: '今天沒有課',
    week,
    today: weekday,
    nowMin: minute,
  };
}

/**
 * Pushes the week's classes to the 課表 widget as a timeline: a new entry at every class start
 * and end over the next 7 days plus each midnight, so the widget stays right without the app.
 */
export async function syncScheduleWidget(entries: ScheduleEntry[]) {
  if (!widgetsAvailable()) return;
  try {
    const { scheduleWidget } = await import('./schedule-widget');
    const blocks = weekBlocks(entries);
    const week = weekProps(blocks);
    const now = Date.now();
    const times = new Set<number>([now]);
    for (let offset = 0; offset <= 7; offset++) {
      const { midnight, weekday } = taipeiDay(offset);
      if (offset > 0) times.add(midnight);
      for (const b of blocks.filter((x) => x.weekday === weekday)) {
        times.add(midnight + b.startMin * 60_000);
        times.add(midnight + b.endMin * 60_000);
      }
    }
    const timeline = [...times]
      .filter((t) => t >= now)
      .sort((a, b) => a - b)
      .slice(0, MAX_ENTRIES)
      .map((t) => ({ date: new Date(t), props: propsAt(blocks, week, t) }));
    scheduleWidget.updateTimeline(timeline);
    lastError = null;
  } catch (e) {
    // No widget extension (e.g. Expo Go): nothing to update.
    lastError = e instanceof Error ? e.message : String(e);
  }
}

let lastError: string | null = null;

export type WidgetDiagnostics = {
  /** The app group the app resolved (may carry a sideloader's team-ID suffix). */
  group: string | null;
  /** Whether this build can open that group's shared container. */
  containerOk: boolean;
  /** Timeline entries the widget can read. */
  entries: number;
  error: string | null;
};

/** What 設定 shows under 小工具, to tell "no data yet" from "the widget can't see the app's data". */
export async function getWidgetDiagnostics(): Promise<WidgetDiagnostics | null> {
  if (!widgetsAvailable()) return null;
  const native = requireOptionalNativeModule<{ appGroupIdentifier?: string | null; widgetsDirectory?: string | null }>('ExpoWidgets');
  let entries = 0;
  try {
    const { scheduleWidget } = await import('./schedule-widget');
    entries = (await scheduleWidget.getTimeline()).length;
  } catch (e) {
    lastError ??= e instanceof Error ? e.message : String(e);
  }
  return {
    group: native?.appGroupIdentifier ?? null,
    containerOk: !!native?.widgetsDirectory,
    entries,
    error: lastError,
  };
}

/** Clears the widget on sign-out so it doesn't keep showing the previous student's classes. */
export async function clearScheduleWidget() {
  if (!widgetsAvailable()) return;
  try {
    const { scheduleWidget } = await import('./schedule-widget');
    scheduleWidget.updateSnapshot({ day: '', date: '', classes: [], message: '登入管城市以顯示課表' });
  } catch {
    // ignore
  }
}
