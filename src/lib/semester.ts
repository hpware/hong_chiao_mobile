/** Same as the web app's `lib/semester.ts`: current ROC academic year + semester. */
export function getSemesterFromDate(date = new Date()) {
  const month = date.getMonth() + 1;
  const isSecondSemester = month > 1 && month < 8;
  return {
    year: date.getFullYear() - (isSecondSemester ? 1912 : 1911),
    sem: isSecondSemester ? 2 : 1,
  };
}

/**
 * Default term for bill downloads. Mirrors the (slightly different) rule the
 * web app's `billDownloadId` procedure uses: April–July is the second semester.
 */
export function currentBillSemester(date = new Date()): { year: number; semester: 1 | 2 } {
  const month = date.getMonth(); // 0-based, matching the web code
  const rocYear = date.getFullYear() - 1911;
  if (month > 2 && month < 7) return { year: rocYear - 1, semester: 2 };
  return { year: rocYear, semester: 1 };
}

const semesterNames: Record<number, string> = { 1: '第一學期', 2: '第二學期' };

export function formatSemester(year: number, semistry: number) {
  return `${year} 學年度 ${semesterNames[semistry] ?? `第 ${semistry} 學期`}`;
}
