import { parse, type HTMLElement } from 'node-html-parser';

/**
 * Parsers for TPCU's legacy student system (siw.tpcu.edu.tw/tsint, "舊系統").
 * Ported from the Agora-AI backend (`backend/src/parsers/*`, BeautifulSoup) to node-html-parser.
 * Pure functions: no network, no app imports, so they can be tested against saved pages.
 */

const NBSP = / /g;

function text(el: HTMLElement) {
  return el.text.replace(NBSP, '').trim();
}

/** The element's text split on `<br>`s, blank lines dropped. */
function lines(el: HTMLElement) {
  const withBreaks = el.innerHTML.replace(/<br\s*\/?>/gi, '\n');
  return parse(`<div>${withBreaks}</div>`)
    .text.split('\n')
    .map((l) => l.replace(NBSP, '').trim())
    .filter(Boolean);
}

function findTable(root: HTMLElement, predicate: (table: HTMLElement) => boolean) {
  return root.querySelectorAll('table').find(predicate) ?? null;
}

export type SelectOption = { value: string; label: string; selected: boolean };

export function parseSelect(html: string, id: string): SelectOption[] {
  // Old pages leave <option> unclosed, which confuses DOM parsers, so read options by regex.
  const select = html.match(new RegExp(`<select[^>]*id=["']?${id}["']?[^>]*>([\\s\\S]*?)</select>`, 'i'));
  if (!select) return [];
  return [...select[1].matchAll(/<option([^>]*)>([^<]*)/gi)].map((m) => ({
    value: m[1].match(/value=['"]?([^'"\s>]*)/i)?.[1] ?? '',
    label: m[2].replace(NBSP, '').trim(),
    selected: /\bselected\b/i.test(m[1]),
  }));
}

// ---------------------------------------------------------------------------
// 課表 (ag222.jsp)

export type ScheduleEntry = {
  weekday: number; // 1 = 週一 … 7 = 週日
  period: string; // 第一節
  time: string; // 0820-0910
  course: string;
  teacher: string;
  classroom: string;
};

// Column → weekday. Columns 0, 6 and 8 hold period labels (weekday / Saturday / Sunday times).
const WEEKDAY_COLUMNS: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 7: 6, 9: 7 };
const TIME_COLUMN: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 7: 6, 9: 8 };

export function parseSchedule(html: string): ScheduleEntry[] {
  const root = parse(html);
  const table = findTable(root, (t) => ['一', '二', '三', '四', '五', '六', '日'].every((d) => t.text.includes(d)));
  if (!table) return [];

  const entries: ScheduleEntry[] = [];
  for (const row of table.querySelectorAll('tr').slice(1)) {
    const cols = row.querySelectorAll('td');
    if (cols.length !== 10) continue;
    const periods: Record<number, { period: string; time: string }> = {};
    for (const c of [0, 6, 8]) {
      const l = lines(cols[c]);
      periods[c] = { period: l[0] ?? '', time: l.find((x) => /\d{4}-\d{4}/.test(x)) ?? '' };
    }
    for (const [col, weekday] of Object.entries(WEEKDAY_COLUMNS)) {
      const l = lines(cols[Number(col)]);
      if (!l.length) continue;
      const { period, time } = periods[TIME_COLUMN[Number(col)]];
      if (!period) continue;
      // Class names end with "." (e.g. 五專資訊三真.) and aren't a teacher or room.
      const teacher = l[1] && !l[1].endsWith('.') ? l[1] : '';
      const classroom = l[2] && !l[2].endsWith('.') ? l[2] : '';
      entries.push({
        weekday,
        period,
        time,
        course: l[0].replace(/【[^】]*】/g, '').trim(),
        teacher,
        classroom,
      });
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// 歷年成績 (ag102.jsp)

export type GradeEntry = {
  semester: string; // 114學年度第2學期
  course: string;
  type: string; // 必修 / 選修
  credits: string;
  score: string;
  passed: boolean;
};

export type SemesterSummary = { semester: string; items: string[] };

const GRADE_FOOTER = ['學期總平均', '修習學分數', '實得學分數'];

export function parseGrades(html: string): { entries: GradeEntry[]; summaries: SemesterSummary[] } {
  const root = parse(html);
  const entries: GradeEntry[] = [];
  const summaries: SemesterSummary[] = [];

  for (const table of root.querySelectorAll('table')) {
    if (table.querySelector('table')) continue; // layout table
    const t = table.text;
    if (!t.includes('科目名稱') || !t.includes('學年度')) continue;

    let semester = '';
    for (const row of table.querySelectorAll('tr')) {
      const cols = row.querySelectorAll('td');
      if (!cols.length) continue;
      const first = text(cols[0]);
      if (first.includes('學年度')) {
        semester = first;
        continue;
      }
      if (GRADE_FOOTER.some((k) => first.includes(k))) {
        const items = cols.map(text).filter(Boolean).join(' ').replace(/※\s*/g, '').trim();
        if (items) {
          const existing = summaries.find((s) => s.semester === semester);
          if (existing) existing.items.push(items);
          else summaries.push({ semester, items: [items] });
        }
        continue;
      }
      if (!first || first.includes('科目名稱')) continue;
      // Each row holds up to two courses: columns 0-3 and 4-7.
      for (const offset of [0, 4]) {
        if (cols.length < offset + 4) break;
        const course = text(cols[offset]);
        if (!course || GRADE_FOOTER.some((k) => course.includes(k))) continue;
        const scoreCell = cols[offset + 3];
        const score = text(scoreCell);
        const red = scoreCell.querySelectorAll('font').some((f) => /red/i.test(f.getAttribute('color') ?? ''));
        entries.push({
          semester,
          course,
          type: text(cols[offset + 1]),
          credits: text(cols[offset + 2]),
          score,
          passed: score ? !red : true,
        });
      }
    }
  }
  return { entries, summaries };
}

// ---------------------------------------------------------------------------
// 缺曠 (ak002_01.jsp)

export type AbsenceEntry = { date: string; weekday: string; period: string; type: string };

export const ABSENCE_PERIODS = ['朝會', '早自習', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'K', 'A', 'B', 'C', 'D', 'E'];

export function parseAbsence(html: string): AbsenceEntry[] {
  const root = parse(html);
  const table = findTable(root, (t) => t.text.includes('朝會') && !t.querySelector('table'));
  if (!table) return [];
  const rows = table.querySelectorAll('tr');
  // Period columns come from the header (項次, 日期, 朝會, 自, 1 … E), so a different number of
  // periods doesn't shift anything.
  const header = rows[0]?.querySelectorAll('td, th').map((c) => text(c)) ?? [];
  const dateCol = Math.max(1, header.findIndex((h) => h.includes('日期')));
  const periods = header.slice(dateCol + 1).map((h) => (h === '自' ? '早自習' : h));
  const entries: AbsenceEntry[] = [];
  for (const row of rows.slice(1)) {
    const cols = row.querySelectorAll('td');
    const m = cols[dateCol]?.text.match(/(\d+\/\d+\/\d+)\s*[（(]\s*([一二三四五六日])\s*[）)]/);
    if (!m) continue;
    periods.forEach((period, i) => {
      const type = cols[dateCol + 1 + i] ? text(cols[dateCol + 1 + i]) : '';
      if (type) entries.push({ date: m[1], weekday: m[2], period: period || ABSENCE_PERIODS[i] || '', type });
    });
  }
  return entries;
}

/** The page's own message when there's nothing to show, e.g. 查無 115學年度第1學期 的缺曠請假資料！ */
export function parseEmptyMessage(html: string) {
  return parse(html).text.match(/查無[^！!\n]*[！!]?/)?.[0]?.trim() ?? '';
}

// ---------------------------------------------------------------------------
// 假單 (ck001_view.jsp / ck001_02.jsp)

export type LeaveEntry = {
  barcode: string;
  reason: string;
  applyDate: string; // YYYMMDD (ROC)
  startDate: string;
  endDate: string;
  teacherStatus: string;
  teacherNote: string;
  officerStatus: string;
  officerNote: string;
  /** e.g. 作廢 / 無法異動(已核准); empty when the row has a delete button. */
  actionStatus: string;
  /** Arguments of the row's go_del(...) button, when the leave can still be deleted. */
  deleteArgs: { stdkey: string; barcode: string; sdate: string; edate: string } | null;
};

export function parseLeaves(html: string): LeaveEntry[] {
  const root = parse(html);
  const table = findTable(root, (t) => t.text.includes('假單編號') && !t.querySelector('table'));
  if (!table) return [];
  const entries: LeaveEntry[] = [];
  for (const row of table.querySelectorAll('tr').slice(1)) {
    const cols = row.querySelectorAll('td');
    if (cols.length < 12) continue;
    const del = cols[11].innerHTML.match(/go_del\('(\d+)','([^']+)','(\d+)','(\d+)'\)/);
    entries.push({
      barcode: text(cols[1]),
      reason: text(cols[2]),
      applyDate: text(cols[3]),
      startDate: text(cols[4]),
      endDate: text(cols[5]),
      teacherStatus: text(cols[7]),
      teacherNote: text(cols[8]).replace(/^\/$/, ''),
      officerStatus: text(cols[9]).replace(/^\/$/, ''),
      officerNote: text(cols[10]).replace(/^\/$/, ''),
      actionStatus: text(cols[11]),
      deleteArgs: del ? { stdkey: del[1], barcode: del[2], sdate: del[3], edate: del[4] } : null,
    });
  }
  return entries;
}

export type LeaveType = { id: string; short: string; name: string };

export type LeaveForm = {
  /** Period labels in form order: 朝會, 早自習, 1 … E. */
  periodOrder: string[];
  /** Periods that have a class that day; only these can be selected. */
  scheduled: string[];
  /** YYYMMDD (ROC) the form was opened for. */
  date: string;
  weekday: string;
  leaveTypes: LeaveType[];
  /** 公假 (id 23) may only use one of these reasons. */
  publicLeaveReasons: string[];
};

export function parseLeaveForm(html: string): LeaveForm {
  const leaveTypes = [...html.matchAll(/<input[^>]*name=["']?rdo1["']?[^>]*value=["']?(\d+)#([^"'>\s]*)["']?[^>]*>\s*([^<]*)/gi)].map(
    (m) => ({ id: m[1], short: m[2], name: m[3].replace(/[\s\u3000]/g, '') || m[2] }),
  );
  const publicLeaveReasons = [...html.matchAll(/<input[^>]*name=["']?reson_23["']?[^>]*value=["']?([^"'>]+)["']?/gi)].map(
    (m) => m[1],
  );
  const empty = { periodOrder: [], scheduled: [], date: '', weekday: '', leaveTypes, publicLeaveReasons };

  const root = parse(html);
  const table = findTable(root, (t) => t.text.includes('朝會') && !t.querySelector('table'));
  if (!table) return empty;
  const rows = table.querySelectorAll('tr');
  const header = rows.find((r) => r.text.includes('朝會'));
  if (!header) return empty;
  const headerCells = header.querySelectorAll('td, th');
  const start = headerCells.findIndex((c) => text(c).includes('朝會'));
  if (start < 0) return empty;
  const periodOrder = headerCells.slice(start).map(text).filter(Boolean);

  for (const row of rows) {
    if (row === header) continue;
    const cols = row.querySelectorAll('td');
    if (cols.length < start + periodOrder.length) continue;
    const date = row.innerHTML.match(/id=["']?ls_date1["']?[^>]*value=["']?(\d{7})/)?.[1];
    if (!date) continue;
    return {
      ...empty,
      periodOrder,
      // Class periods carry an `h_…` hidden input (the cell is also tinted blue).
      scheduled: periodOrder.filter((_, i) => /id=["']?h_/.test(cols[start + i].innerHTML)),
      date,
      weekday: text(cols[start - 1]),
    };
  }
  return { ...empty, periodOrder };
}

/** Reads the `alert('…')` an action page answers with and classifies it. */
export function classifyAlert(html: string, success: string[], failure: string[]) {
  // The JS string's escapes (`\n`) arrive as literal text; turn them into real line breaks.
  const message = (html.match(/alert\(['"]([^'"]+)['"]\)/)?.[1] ?? '')
    .replace(/\\n/g, '\n')
    .replace(/\n\s*/g, '\n')
    .trim();
  if (success.some((k) => message.includes(k))) return { success: true as const, message };
  if (failure.some((k) => message.includes(k))) return { success: false as const, message };
  return { success: null, message };
}

// ---------------------------------------------------------------------------
// 獎懲 (ak010.jsp)

export type RewardEntry = { date: string; type: string; count: string; reason: string };

export function parseRewards(html: string): RewardEntry[] {
  const root = parse(html);
  const entries: RewardEntry[] = [];
  for (const row of root.querySelectorAll('tr')) {
    const cols = row.querySelectorAll('td').map(text);
    // … 姓名, 學號, 發生日期 (YYYMMDD), 獎懲類別, 獎懲支數, 事由內容
    const i = cols.findIndex((c) => /^\d{7}$/.test(c));
    if (i < 0 || cols.length < i + 4) continue;
    entries.push({ date: cols[i], type: cols[i + 1], count: cols[i + 2], reason: cols[i + 3] });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// 選單 (perchk.jsp): every siw function the student can open

export type LegacyFunction = { fncid: string; name: string };

export function parseLegacyMenu(html: string): LegacyFunction[] {
  const seen = new Set<string>();
  const items: LegacyFunction[] = [];
  for (const m of html.matchAll(/of_display\('([^']+)'\)[^>]*?parent\.status='([^']*)'/g)) {
    const fncid = m[1];
    if (seen.has(fncid)) continue;
    seen.add(fncid);
    const name = m[2].replace(/\([0-9A-Z]{5,6}\)\s*$/, '').trim();
    if (!name || name.includes('功能暫停')) continue;
    items.push({ fncid, name });
  }
  return items;
}

// ---------------------------------------------------------------------------
// 期中成績 (AG009)

export type MidtermEntry = { course: string; score: string };

/**
 * Best effort: the page is only open for a few weeks a semester. Outside that window it just
 * says when it opens (`notice`); otherwise reads the table with 科目 / 成績 headers.
 */
export function parseMidterm(html: string): { notice: string; entries: MidtermEntry[] } {
  const root = parse(html);
  const text = root.text.replace(/\s+/g, ' ');
  const notice = text.match(/期中成績[^。]*開放查詢。/)?.[0] ?? parseEmptyMessage(html);
  const entries: MidtermEntry[] = [];
  for (const table of root.querySelectorAll('table')) {
    if (table.querySelector('table')) continue;
    const rows = table.querySelectorAll('tr').map((r) => r.querySelectorAll('td, th').map((c) => c.text.replace(/[\s\u3000]+/g, ' ').trim()));
    const headerIndex = rows.findIndex((r) => r.some((c) => c.includes('科目')) && r.some((c) => /成績|分數/.test(c)));
    if (headerIndex < 0) continue;
    const header = rows[headerIndex];
    const courseCol = header.findIndex((c) => c.includes('科目'));
    const scoreCol = header.findIndex((c) => /期中|成績|分數/.test(c) && !c.includes('科目'));
    for (const r of rows.slice(headerIndex + 1)) {
      const course = r[courseCol];
      if (!course || r.length !== header.length) continue;
      entries.push({ course: course.replace(/【[^】]*】/g, '').trim(), score: r[scoreCol] ?? '' });
    }
  }
  return { notice, entries };
}

// ---------------------------------------------------------------------------
// Shared: header-mapped tables and lenient <select> reading

/** Like `parseSelect` but tolerant of `value = "…"` / `value='…'` and selects found by name. */
export function parseOptions(html: string, nameOrId: string): SelectOption[] {
  const select = html.match(
    new RegExp(`<select[^>]*(?:id|name)\\s*=\\s*["']?${nameOrId}["']?[^>]*>([\\s\\S]*?)</select>`, 'i'),
  );
  if (!select) return [];
  return [...select[1].matchAll(/<option([^>]*)>([^<]*)/gi)].map((m) => ({
    value: m[1].match(/value\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*))/i)?.slice(1).find((v) => v !== undefined) ?? '',
    label: m[2].replace(NBSP, '').trim(),
    selected: /\bselected\b/i.test(m[1]),
  }));
}

/** Rows of the first table whose header row has every one of `headers`, keyed by header text. */
function headerTable(html: string, headers: string[]): Record<string, string>[] {
  const root = parse(html);
  for (const table of root.querySelectorAll('table')) {
    const rows = table.querySelectorAll('tr').filter((r) => r.closest('table') === table);
    const headerIndex = rows.findIndex((r) => {
      const cells = r.querySelectorAll('td,th').map((c) => text(c).replace(/\s+/g, ''));
      return headers.every((h) => cells.includes(h));
    });
    if (headerIndex < 0) continue;
    const keys = rows[headerIndex].querySelectorAll('td,th').map((c) => text(c).replace(/\s+/g, ''));
    return rows.slice(headerIndex + 1).flatMap((r) => {
      const cells = r.querySelectorAll('td,th');
      if (cells.length < keys.length) return [];
      return [Object.fromEntries(keys.map((k, i) => [k, text(cells[i]).replace(/\s+/g, ' ').trim()]))];
    });
  }
  return [];
}

// ---------------------------------------------------------------------------
// 收件查詢 (ztt001_1.jsp)

export type MailItem = {
  /** 登錄日期, ROC `115/11/17` */
  registered: string;
  recipient: string;
  /** 領件日期; empty while waiting at the mailroom. */
  pickedUpAt: string;
  pickedUpBy: string;
  /** 分發單位, e.g. 五專資訊三真.【男舍:室-0床】 */
  unit: string;
  /** 來函單位 (sender / courier) */
  sender: string;
  /** 掛號號碼 */
  trackingNo: string;
};

export function parseMail(html: string): MailItem[] {
  return headerTable(html, ['登錄日期', '收件人']).map((r) => ({
    registered: r['登錄日期'] ?? '',
    recipient: r['收件人'] ?? '',
    pickedUpAt: r['領件日期'] ?? '',
    pickedUpBy: r['領件人'] ?? '',
    unit: r['分發單位'] ?? '',
    sender: r['來函單位'] ?? '',
    trackingNo: r['掛號號碼'] ?? '',
  }));
}

// ---------------------------------------------------------------------------
// 科目與教師開課資料查詢 (ag203_1.jsp)

export type OfferedCourse = {
  className: string;
  code: string;
  category: string;
  course: string;
  teacher: string;
  credits: string;
  required: string;
  hours: string;
  open: string;
  /** e.g. `(三)2-4` */
  time: string;
  room: string;
  combined: string;
  note: string;
};

export function parseCourseSearch(html: string): OfferedCourse[] {
  return headerTable(html, ['選課代號', '科目']).map((r) => ({
    className: r['班級'] ?? '',
    code: r['選課代號'] ?? '',
    category: r['類別'] ?? '',
    course: r['科目'] ?? '',
    teacher: r['授課教師'] ?? '',
    credits: r['學分數'] ?? '',
    required: r['必/選修'] ?? '',
    hours: r['授課時數'] ?? '',
    open: r['開課否'] ?? '',
    time: r['上課時間'] ?? '',
    room: r['上課教室'] ?? '',
    combined: r['合班班級'] ?? '',
    note: r['備註'] ?? '',
  }));
}

/** `五專資訊三真.` and its id from the class list (ag304_02.jsp). */
export function parseClassList(html: string): { id: string; name: string }[] {
  return [...html.matchAll(/go_next\('([^']+)'\)[^>]*>\s*<u>([^<]+)<\/u>/g)].map((m) => ({
    id: m[1],
    name: m[2].trim(),
  }));
}

// ---------------------------------------------------------------------------
// 班級 / 教師課表 (ag304_03.jsp, ag300_02.jsp)

export type TimetableCourse = {
  code: string;
  course: string;
  category: string;
  credits: string;
  required: string;
  time: string;
  teacher: string;
  room: string;
  className: string;
};

/** Period → `0920-1010` from the grid's first column (`第 2 節0920-1010`). Falls back to TPCU's day periods. */
function periodTimes(html: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const m of html.matchAll(/第\s*(\d+)\s*節\s*(?:<[^>]*>|&nbsp;|\s)*(\d{4}-\d{4})/g)) map[m[1]] = m[2];
  if (Object.keys(map).length) return map;
  return {
    '1': '0820-0910', '2': '0920-1010', '3': '1020-1110', '4': '1120-1210',
    '5': '1300-1350', '6': '1400-1450', '7': '1500-1550', '8': '1600-1650',
  };
}

const WEEKDAY_CHARS = '一二三四五六日';

/**
 * Expands `(五)5-6`, `(一)2-4 (三)5`, `(二)1,3` into schedule entries so the same calendar code
 * renders other classes' and teachers' timetables.
 */
export function expandTimes(course: { time: string; course: string; teacher: string; room: string }, times: Record<string, string>): ScheduleEntry[] {
  const out: ScheduleEntry[] = [];
  for (const m of course.time.matchAll(/[（(]([一二三四五六日])[)）]\s*([\d,\-、 ]+)/g)) {
    const weekday = WEEKDAY_CHARS.indexOf(m[1]) + 1;
    const periods = new Set<number>();
    for (const part of m[2].split(/[,、\s]+/).filter(Boolean)) {
      const [a, b] = part.split('-').map(Number);
      for (let p = a; p <= (b || a); p++) if (Number.isFinite(p)) periods.add(p);
    }
    for (const p of [...periods].sort((x, y) => x - y)) {
      out.push({ weekday, period: `第${p}節`, time: times[String(p)] ?? '', course: course.course, teacher: course.teacher, classroom: course.room });
    }
  }
  return out;
}

export function parseTimetable(html: string): { courses: TimetableCourse[]; entries: ScheduleEntry[]; empty: boolean } {
  const rows = headerTable(html, ['上課時間']).filter((r) => r['科目']);
  const courses = rows.map((r) => ({
    code: r['選課代碼'] ?? r['選課代號'] ?? '',
    course: r['科目'] ?? '',
    category: r['類別'] ?? '',
    credits: r['學分'] ?? r['學分數'] ?? '',
    required: (r['必選修'] ?? r['必/選修'] ?? '').replace(/[【】]/g, ''),
    time: r['上課時間'] ?? '',
    teacher: r['授課教師'] ?? r['教師'] ?? '',
    room: r['教室'] ?? r['上課教室'] ?? '',
    className: r['班級'] ?? r['班級名稱'] ?? '',
  }));
  const times = periodTimes(html);
  const entries = courses
    .flatMap((c) => expandTimes(c, times))
    .sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time));
  return { courses, entries, empty: html.includes('目前沒有相關資料') || courses.length === 0 };
}
