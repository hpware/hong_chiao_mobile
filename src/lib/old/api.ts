import type { PickedFile } from '@/lib/multipart';

import { getLegacyMenuHtml, legacyPost, legacyPostMultipart, openLegacyFunction, type MultipartPart } from './client';
import {
  classifyAlert,
  parseAbsence,
  parseEmptyMessage,
  parseGrades,
  parseLeaveForm,
  parseLeaves,
  parseClassList,
  parseCourseSearch,
  parseLegacyMenu,
  parseMail,
  parseOptions,
  parseTimetable,
  parseRewards,
  parseSchedule,
  parseMidterm,
  parseSelect,
  type LeaveEntry,
  type LeaveForm,
  type LeaveType,
} from './parsers';

export type * from './parsers';

/** Today in Taipei as ROC `YYYMMDD`, e.g. 1151121. */
export function todayRoc(offsetDays = 0) {
  const now = new Date(Date.now() + 8 * 3600_000 + offsetDays * 86_400_000);
  return `${now.getUTCFullYear() - 1911}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
}

/** `1151124` → `115/11/24` */
export function formatRoc(compact: string) {
  return /^\d{7}$/.test(compact) ? `${compact.slice(0, 3)}/${compact.slice(3, 5)}/${compact.slice(5)}` : compact;
}

export function rocToDate(compact: string) {
  return new Date(Number(compact.slice(0, 3)) + 1911, Number(compact.slice(3, 5)) - 1, Number(compact.slice(5, 7)));
}

export function dateToRoc(d: Date) {
  return `${d.getFullYear() - 1911}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

// 課表 ------------------------------------------------------------------------

export async function getScheduleSemesters() {
  const html = await legacyPost('/tsint/system/sys001_00.jsp?spath=ag_pro/ag222.jsp?', [['fncid', 'AG222']]);
  return parseSelect(html, 'yms');
}

export async function getSchedule(yms: string) {
  const [year, semester] = yms.split(',').map((s) => s.trim());
  const html = await legacyPost('/tsint/ag_pro/ag222.jsp', [
    ['yms', yms],
    ['spath', 'ag_pro/ag222.jsp?'],
    ['arg01', year],
    ['arg02', semester],
  ]);
  return parseSchedule(html);
}

// 成績 ------------------------------------------------------------------------

export async function getGrades() {
  const html = await legacyPost('/tsint/ag_pro/ag102.jsp', [
    ['arg01', ''],
    ['arg02', ''],
    ['arg03', ''],
    ['arg04', ''],
    ['arg05', ''],
    ['arg06', ''],
    ['fncid', 'AG102'],
  ]);
  return parseGrades(html);
}

// 缺曠 ------------------------------------------------------------------------

export async function getAbsenceOptions() {
  const html = await legacyPost('/tsint/ak_pro/ak002_00.jsp', [['fncid', 'AK002']]);
  return { semesters: parseSelect(html, 'yms'), types: parseSelect(html, 'leave') };
}

/**
 * The whole semester as ROC dates. 學生缺曠查詢 filters by its 日期 range (the website defaults
 * it to today–today, which finds nothing), so ask for the full term: first semester Aug–Jan,
 * second semester Feb–Jul.
 */
export function semesterRange(yms: string): [string, string] {
  const [year, sem] = yms.split(',').map((x) => Number(x.trim()));
  return sem === 2 ? [`${year + 1}0201`, `${year + 1}0731`] : [`${year}0801`, `${year + 1}0131`];
}

/** 學生缺曠查詢 (ak002_01.jsp) for a whole semester, posted like the website's form. */
export async function getAbsence(yms: string, type = '00') {
  const [start, end] = semesterRange(yms);
  const html = await legacyPost('/tsint/ak_pro/ak002_01.jsp', [
    ['yms', yms],
    ['leave', type],
    ['etxt_syear', start.slice(0, 3)],
    ['etxt_smonth', start.slice(3, 5)],
    ['etxt_sday', start.slice(5, 7)],
    ['etxt_eyear', end.slice(0, 3)],
    ['etxt_emonth', end.slice(3, 5)],
    ['etxt_eday', end.slice(5, 7)],
    ['spath', ''],
    ['sdate', start],
    ['edate', end],
  ]);
  return { entries: parseAbsence(html), emptyMessage: parseEmptyMessage(html) };
}

// 請假 ------------------------------------------------------------------------

export async function getLeaves(start: string, end: string): Promise<LeaveEntry[]> {
  const html = await legacyPost('/tsint/ck_pro/ck001_view.jsp', [
    ['etxt_sdate', formatRoc(start)],
    ['etxt_edate', formatRoc(end)],
    ['sdate', start],
    ['edate', end],
    ['sms_bdate', ''],
    ['sms_edate', ''],
  ]);
  return parseLeaves(html);
}

/** Opens the leave form for one day (what the website's 新增 button does). */
export async function getLeaveForm(date: string): Promise<LeaveForm> {
  const html = await legacyPost('/tsint/ck_pro/ck001_02.jsp', [
    ['etxt_sdate', formatRoc(date)],
    ['etxt_edate', formatRoc(date)],
    ['sdate', date],
    ['edate', date],
    ['sms_bdate', ''],
    ['sms_edate', ''],
  ]);
  return parseLeaveForm(html);
}

export type LeaveAttachment = PickedFile;

/** Submits a one-day leave, mirroring the form's own `go_save()`. */
export async function applyLeave(options: {
  form: LeaveForm;
  type: LeaveType;
  periods: string[];
  reason: string;
  attachment?: LeaveAttachment | null;
}) {
  const { form, type, periods, reason, attachment } = options;
  if (!periods.length) throw new Error('請選擇要請假的節次。');
  if (!reason.trim()) throw new Error(type.id === '23' ? '請選擇請假原因。' : '請輸入請假原因。');
  // Same check as the form: no links.
  if (reason.includes('http') || reason.includes('\\\\:')) throw new Error('事由格式不正確！');
  if (type.id === '23' && !attachment) throw new Error('公假必須上傳附件。');
  // 早自習/朝會 can't be taken alone (school rule enforced by the form).
  const early = periods.some((p) => p === '朝會' || p === '早自習');
  if (early && !periods.includes('1') && form.scheduled.includes('1')) {
    throw new Error('早自習或朝會未到，不得單獨請假，至少須與第一節課合併請假。');
  }

  const selected = new Set(periods);
  const leaValue = `${form.date}%${form.periodOrder.map((p) => (selected.has(p) ? type.id : '0')).join('%')}%`;

  const parts: MultipartPart[] = [
    { name: 'rdo1', value: `${type.id}#${type.short}` },
    ...(type.id === '23' ? [{ name: 'reson_23', value: reason }] : []),
    { name: 'std_reason', value: reason },
    { name: 'ls_date1', value: form.date },
    attachment
      ? { name: 'uploadfile', filename: attachment.name, contentType: attachment.contentType, bytes: attachment.bytes }
      : { name: 'uploadfile', filename: '', contentType: 'application/octet-stream', bytes: new Uint8Array() },
    { name: 'leaveid', value: type.id },
    { name: 'leavename', value: type.short },
    { name: 'lea_value', value: leaValue },
    { name: 'ls_chk', value: 'Y' },
    { name: 'todo', value: 'upload' },
  ];
  const html = await legacyPostMultipart('/tsint/ck_pro/ck001_ins.jsp', parts);
  return classifyAlert(
    html,
    ['完成', '成功', '已送出', '存檔', '申請完成', '請假完成', '准假'],
    ['失敗', '錯誤', '請選取', '請輸入', '請選擇', '不得', '必須', '重複', '未到', '附件', '格式不正確'],
  );
}

export async function deleteLeave(args: NonNullable<LeaveEntry['deleteArgs']>) {
  const html = await legacyPost('/tsint/ck_pro/ck001_del.jsp', [
    ['stdkey', args.stdkey],
    ['barcode', args.barcode],
    ['dvsid', ''],
    ['sdate', args.sdate],
    ['edate', args.edate],
  ]);
  return classifyAlert(html, ['刪除', '完成', '成功'], ['失敗', '錯誤', '不得', '已核准']);
}

// 獎懲 ------------------------------------------------------------------------

export async function getRewardSemesters() {
  return parseSelect(await openLegacyFunction('AK010'), 'yms');
}

export async function getRewards(yms: string) {
  const [year, semester] = yms.split(',');
  const html = await legacyPost('/tsint/ak_pro/ak010.jsp', [
    ['yms', yms],
    ['spath', 'ak_pro/ak010.jsp?'],
    ['arg01', year],
    ['arg02', semester],
  ]);
  return parseRewards(html);
}

// 全部功能 --------------------------------------------------------------------

export async function getLegacyMenu() {
  return parseLegacyMenu(await getLegacyMenuHtml());
}

// 期中成績 / 學期成績 -------------------------------------------------------------

/** 期中成績 for the current semester (AG009). */
export async function getMidtermGrades() {
  return parseMidterm(await openLegacyFunction('AG009'));
}

/** Semesters 學期成績查詢 (AG008) offers, e.g. 115學年度第1學期 before it shows up in 歷年成績. */
export async function getSemesterGradeOptions() {
  return parseSelect(await openLegacyFunction('AG008'), 'yms');
}

// 收件查詢 ---------------------------------------------------------------------

/** Mail and parcels the mailroom logged for the student: waiting ones, or picked up between two ROC dates. */
export async function getMail(kind: 'waiting' | 'history', from = '', to = '') {
  await openLegacyFunction('ZTT001');
  const search = kind === 'waiting' ? '1(@)(@)' : `2(@)${formatRoc(from)}(@)${formatRoc(to)}`;
  const html = await legacyPost('/tsint/ztt_pro/ztt001_1.jsp', [
    ['etxt_indate_s', kind === 'waiting' ? '' : formatRoc(from)],
    ['etxt_indate_e', kind === 'waiting' ? '' : formatRoc(to)],
    ['ls_search', search],
  ]);
  return parseMail(html);
}

// 開課查詢 / 班級課表 / 教師課表 ------------------------------------------------

/** `115#1` → [`115`, `1`] */
const splitYms = (yms: string) => yms.split('#') as [string, string];

/** Semesters, 學制, 科系 for 科目與教師開課資料查詢 (AG203). */
export async function getCourseSearchOptions() {
  const html = await openLegacyFunction('AG203');
  return {
    semesters: parseOptions(html, 'yms_yms'),
    degrees: parseOptions(html, 'dgr_id'),
    units: parseOptions(html, 'unt_id'),
  };
}

/** 類別 options depend on the semester (ag203_crk.jsp). */
export async function getCourseCategories(yms: string) {
  const [year, sms] = splitYms(yms);
  const html = await legacyPost('/tsint/ag_pro/ag203_crk.jsp', [['ls_year', year], ['ls_sms', sms]]);
  return parseOptions(html, 'sel_crk');
}

export async function searchCourses(q: {
  yms: string;
  degree: string;
  unit: string;
  grade?: string;
  category?: string;
  subject?: string;
  teacher?: string;
}) {
  const [year, sms] = splitYms(q.yms);
  const html = await legacyPost('/tsint/ag_pro/ag203_1.jsp', [
    ['yms_yms', q.yms],
    ['ls_year', year],
    ['ls_sms', sms],
    ['dgr_id', q.degree],
    ['unt_id', q.unit],
    ['clyear', q.grade ?? ''],
    ['hid_crk', q.category ?? '%'],
    ['sub_name', q.subject ?? ''],
    ['teacher', q.teacher ?? ''],
  ]);
  return parseCourseSearch(html);
}

/** Semesters and 系所 for 系所班級課表查詢 (AG304). */
export async function getClassTimetableOptions() {
  await openLegacyFunction('AG304');
  const html = await legacyPost('/tsint/ag_pro/ag304_01.jsp', []);
  return { semesters: parseOptions(html, 'yms_yms'), units: parseOptions(html, 'unit_id') };
}

export async function getClasses(yms: string, unit: string) {
  const html = await legacyPost('/tsint/ag_pro/ag304_02.jsp', [['yms_yms', yms], ['unit_id', unit]]);
  return parseClassList(html);
}

export async function getClassTimetable(yms: string, classId: string) {
  const [year, sms] = splitYms(yms);
  const html = await legacyPost('/tsint/ag_pro/ag304_03.jsp', [['arg01', year], ['arg02', sms], ['arg', classId]]);
  return parseTimetable(html);
}

/** Semesters, 系所 and (once a 系所 is chosen) its teachers for 教師課表查詢 (AG300). */
export async function getTeacherTimetableOptions(yms?: string, unit?: string) {
  await openLegacyFunction('AG300');
  const fields: [string, string][] = [];
  if (yms) {
    const [year, sms] = splitYms(yms);
    fields.push(['yms_yms', yms], ['arg01', year], ['arg02', sms], ['ls_yms', yms], ['unit', unit ?? '']);
  }
  const html = await legacyPost('/tsint/ag_pro/ag300_01.jsp', fields);
  return {
    semesters: parseOptions(html, 'yms_yms'),
    units: parseOptions(html, 'unit').filter((u) => u.value),
    // Values are opaque siw keys; only the names are ever shown.
    teachers: parseOptions(html, 'tea_str1').filter((t) => t.value),
  };
}

export async function getTeacherTimetable(yms: string, unit: string, teacher: string) {
  const [year, sms] = splitYms(yms);
  const html = await legacyPost('/tsint/ag_pro/ag300_02.jsp', [
    ['yms_yms', yms],
    ['arg01', year],
    ['arg02', sms],
    ['ls_yms', ''],
    ['unit', unit],
    ['tea_str1', teacher],
  ]);
  return parseTimetable(html);
}
