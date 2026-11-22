import type { ScheduleEntry } from './parsers';

export const WEEKDAY_NAMES = ['', '週一', '週二', '週三', '週四', '週五', '週六', '週日'];

/** `0920-1010` → `09:20–10:10` */
export function formatTimeRange(range: string) {
  const m = range.match(/^(\d{2})(\d{2})-(\d{2})(\d{2})$/);
  return m ? `${m[1]}:${m[2]}–${m[3]}:${m[4]}` : '';
}

export type ScheduleBlock = {
  course: string;
  teacher: string;
  classroom: string;
  periods: string[];
  start: string;
  end: string;
};

/** One weekday's classes, with back-to-back periods of the same course merged into one block. */
export function blocksFor(entries: ScheduleEntry[], weekday: number): ScheduleBlock[] {
  const blocks: ScheduleBlock[] = [];
  for (const e of entries.filter((x) => x.weekday === weekday)) {
    const [start = '', end = ''] = formatTimeRange(e.time).split('–');
    const last = blocks.at(-1);
    if (last && last.course === e.course && last.classroom === e.classroom) {
      last.periods.push(e.period);
      last.end = end || last.end;
    } else {
      blocks.push({ course: e.course, teacher: e.teacher, classroom: e.classroom, periods: [e.period], start, end });
    }
  }
  return blocks;
}

/** `09:20–12:10 · 成306嵌入式系統實驗室` (falls back to the period names when there's no time). */
export function blockSubtitle(b: ScheduleBlock) {
  const when =
    b.start && b.end ? `${b.start}–${b.end}` : b.periods.length > 1 ? `${b.periods[0]}–${b.periods.at(-1)}` : b.periods[0];
  return [when, b.classroom].filter(Boolean).join(' · ');
}

/** 1 = Monday … 7 = Sunday, in Taipei time. */
export function todayWeekday() {
  const day = new Date(Date.now() + 8 * 3600_000).getUTCDay();
  return day === 0 ? 7 : day;
}

// Calendar view helpers --------------------------------------------------------

/** `09:20` → 560 (minutes after midnight). */
export function toMinutes(hhmm: string) {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

export function formatMinutes(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export type CalendarBlock = ScheduleBlock & { weekday: number; startMin: number; endMin: number };

/** Every class of the week as timed blocks (entries without a parseable time are dropped). */
export function weekBlocks(entries: ScheduleEntry[]): CalendarBlock[] {
  const out: CalendarBlock[] = [];
  for (let d = 1; d <= 7; d++) {
    for (const b of blocksFor(entries, d)) {
      const startMin = toMinutes(b.start);
      const endMin = toMinutes(b.end);
      if (Number.isFinite(startMin) && Number.isFinite(endMin)) out.push({ ...b, weekday: d, startMin, endMin });
    }
  }
  return out;
}

/** Hour range that fits every class, padded to whole hours (defaults to 08:00–17:00). */
export function hourRange(blocks: CalendarBlock[]): [number, number] {
  if (!blocks.length) return [8, 17];
  const start = Math.min(...blocks.map((b) => b.startMin));
  const end = Math.max(...blocks.map((b) => b.endMin));
  return [Math.min(8, Math.floor(start / 60)), Math.max(17, Math.ceil(end / 60))];
}

/** Minutes after midnight right now, in Taipei time. */
export function nowMinutes() {
  const d = new Date(Date.now() + 8 * 3600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Monday (Taipei date) of the week `offset` weeks from this one, as a local Date at noon. */
export function mondayOf(offset = 0) {
  const t = new Date(Date.now() + 8 * 3600_000);
  const monday = new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - (todayWeekday() - 1) + offset * 7, 12);
  return monday;
}

export function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
}

/**
 * Stable per-course colour. Hand-picked hues that stay distinct side by side; `fill` is the
 * block background, `ink` the text/stripe colour (≥4.5:1 on its own fill in both themes).
 */
const COURSE_HUES = [
  { light: ['#DCE7FB', '#1B4FA8'], dark: ['#1B2D4F', '#A9C6FF'] }, // blue
  { light: ['#DDF3E6', '#17663D'], dark: ['#163826', '#9BE0B5'] }, // green
  { light: ['#FCE7D6', '#9A4310'], dark: ['#432714', '#FFC69C'] }, // orange
  { light: ['#F6DFEA', '#97275A'], dark: ['#43192E', '#FFAED2'] }, // rose
  { light: ['#DDF1F3', '#0F5E68'], dark: ['#133A3F', '#93DCE6'] }, // teal
  { light: ['#F5EDCB', '#76580A'], dark: ['#3B3112', '#F1D57C'] }, // amber
  { light: ['#E6E4F7', '#3F3A8F'], dark: ['#26244A', '#C2BEFF'] }, // indigo
  { light: ['#E9E9E4', '#4A4A40'], dark: ['#2D2D29', '#D6D6CC'] }, // stone
] as const;

export function courseColor(course: string, dark: boolean) {
  let h = 0;
  for (const ch of course) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [fill, ink] = COURSE_HUES[h % COURSE_HUES.length][dark ? 'dark' : 'light'];
  return { fill, ink };
}

/**
 * Colours assigned in first-seen order over the week so the courses on screen never share a
 * colour (until there are more courses than hues).
 */
export function coursePalette(blocks: CalendarBlock[], dark: boolean) {
  const map = new Map<string, { fill: string; ink: string }>();
  for (const b of [...blocks].sort((a, z) => a.weekday - z.weekday || a.startMin - z.startMin)) {
    if (map.has(b.course)) continue;
    const [fill, ink] = COURSE_HUES[map.size % COURSE_HUES.length][dark ? 'dark' : 'light'];
    map.set(b.course, { fill, ink });
  }
  return (course: string) => map.get(course) ?? courseColor(course, dark);
}

export type UpcomingDay = {
  /** 0 = today, 1 = tomorrow … */
  daysAhead: number;
  weekday: number;
  classes: CalendarBlock[];
};

/**
 * The day whose classes matter at a given moment: today while it still has classes left
 * (`endMin > minute`), otherwise the next day with classes. `null` when the week is empty.
 */
export function upcomingDay(blocks: CalendarBlock[], weekday: number, minute: number): UpcomingDay | null {
  const today = blocks.filter((b) => b.weekday === weekday).sort((a, b) => a.startMin - b.startMin);
  if (today.some((b) => b.endMin > minute)) return { daysAhead: 0, weekday, classes: today };
  for (let ahead = 1; ahead <= 7; ahead++) {
    const d = ((weekday - 1 + ahead) % 7) + 1;
    const classes = blocks.filter((b) => b.weekday === d).sort((a, b) => a.startMin - b.startMin);
    if (classes.length) return { daysAhead: ahead, weekday: d, classes };
  }
  return null;
}

/** 今天 / 明天 / 週三 */
export function dayLabel(day: UpcomingDay) {
  return day.daysAhead === 0 ? '今天' : day.daysAhead === 1 ? '明天' : WEEKDAY_NAMES[day.weekday];
}

const CN_DIGITS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

/** `第二節` / `第 2 節` / `2` → 2; `第十二節` → 12; anything else (朝會, 早自習) → null. */
export function periodNumber(label: string): number | null {
  const digits = label.match(/\d+/);
  if (digits) return Number(digits[0]);
  const cn = label.replace(/[第節\s]/g, '');
  if (!cn || [...cn].some((ch) => !(ch in CN_DIGITS))) return null;
  if (cn.length === 1) return CN_DIGITS[cn];
  if (cn[0] === '十') return 10 + (CN_DIGITS[cn[1]] ?? 0);
  return CN_DIGITS[cn[0]] * 10 + (cn[2] ? CN_DIGITS[cn[2]] : 0);
}

/** siw `yms` (`115,1`) for the semester a date falls in: Aug–Jan is the first, Feb–Jul the second. */
export function ymsForDate(date: Date) {
  const month = date.getMonth() + 1;
  const second = month >= 2 && month <= 7;
  const year = date.getFullYear() - (second ? 1912 : 1911);
  return `${year},${second ? 2 : 1}`;
}

/** Roughly where a semester's classes start: early September / late February. */
export function semesterStart(yms: string) {
  const [year, sem] = yms.split(',').map((x) => Number(x.trim()));
  return sem === 2 ? new Date(year + 1912, 1, 20, 12) : new Date(year + 1911, 8, 1, 12);
}
