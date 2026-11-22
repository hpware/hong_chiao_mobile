import { ajaxPost, ajaxPostJson, ApiError, isLoginResponseUrl, SessionExpiredError } from '@/lib/http';
import { currentBillSemester } from '@/lib/semester';

function getDetailDataViaSpanColTitle(html: string, item: string) {
  const escapedItem = item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<span\\s+class=["']colTitle["']>\\s*` +
      `${escapedItem}\\s*[：:]\\s*` +
      `</span>\\s*` +
      `<span>\\s*([^<]*?)\\s*</span>`,
    'i',
  );
  return pattern.exec(html)?.[1]?.trim() ?? '';
}

export type TuitionDetails = {
  total: string;
  discounts: string;
  due: string;
  paid: string;
  refund: string;
};

/** Port of `tuition.ts`. Returns `null` when the portal has no tuition record for that term. */
export async function getTuition(year: number, semistry: number) {
  const response = await ajaxPost('/YMR_Stu/YMR/StuQryTuitionDtl', [
    ['ppqmodel[SemiYear]', String(year)],
    ['ppqmodel[Semistry]', String(semistry)],
  ]);
  if (isLoginResponseUrl(response.url)) throw new SessionExpiredError();
  const html = await response.text();
  if (html.includes('查無學雜費資訊!')) return null;
  return {
    name: getDetailDataViaSpanColTitle(html, '姓名'),
    class: getDetailDataViaSpanColTitle(html, '班級'),
    details: {
      total: getDetailDataViaSpanColTitle(html, '總額'),
      discounts: getDetailDataViaSpanColTitle(html, '減項'),
      due: getDetailDataViaSpanColTitle(html, '應收'),
      paid: getDetailDataViaSpanColTitle(html, '已收'),
      refund: getDetailDataViaSpanColTitle(html, '應補/退'),
    } satisfies TuitionDetails,
  };
}

export type Term = { year: number; semester: 1 | 2 };
export type GeneratedFile = { id: string; name: string };

/** Ports of `bill/index.ts` and `bill/balance.ts`: ask the portal to render the PDF and return its id. */
export async function getBillFile(kind: 'bill' | 'balance', term?: Term): Promise<GeneratedFile> {
  const t = term ?? currentBillSemester();
  const fields: [string, string][] = [
    ['SemiYear', String(t.year)],
    ['Semistry', String(t.semester)],
    ['KindType', '01'],
    ['Steps', '1'],
  ];
  if (kind === 'balance') fields.push(['ReportType', 'BillBalance']);

  const data = await ajaxPostJson('/YMR_Stu/YMR/Bill_DownloadbyStu', fields);
  if (!data.IsOK) throw new ApiError(data.Msg ?? '遠端伺服器錯誤');
  if (typeof data.FileDownloadName !== 'string' || !data.FileDownloadName) {
    throw new ApiError(kind === 'balance' ? '校務系統回傳的補繳費單檔名無效' : '校務系統回傳的繳費單檔名無效');
  }
  return {
    id: data.FileDownloadName.replace('.pdf', ''),
    name: data.OutFileName ?? (kind === 'balance' ? '補繳費單.pdf' : '繳費單.pdf'),
  };
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function findString(payload: JsonRecord, keys: readonly string[]) {
  const containers = [
    payload,
    asRecord(payload.Data),
    asRecord(payload.data),
    asRecord(payload.obj),
    asRecord(payload.rmodel),
    asRecord(payload.rModel),
  ].filter((v): v is JsonRecord => v !== undefined);
  for (const container of containers) {
    for (const key of keys) {
      const value = container[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return undefined;
}

/** Port of `bill/proof.ts`. */
export async function getProofOfPayment(term: Term): Promise<GeneratedFile> {
  const payload = asRecord(
    await ajaxPostJson('/YMR_Stu/YMR/PayCertify_DownloadbyStu', [
      ['SemiYear', String(term.year)],
      ['Semistry', String(term.semester)],
      ['KindType', '01'],
      ['Steps', '-1'],
    ]),
  );
  if (!payload) throw new ApiError('遠端伺服器回傳了無效資料');
  if (payload.IsOK !== true) {
    throw new ApiError(findString(payload, ['Msg', 'message', 'Message']) ?? '遠端伺服器錯誤');
  }
  const id = findString(payload, ['FileName'])
    ?.split(/[\\/]/)
    .at(-1)
    ?.replace(/\.pdf$/i, '');
  if (!id) throw new ApiError('校務系統回傳的繳費證明檔名無效');
  return { id, name: findString(payload, ['FileDownloadName']) ?? '繳費證明.pdf' };
}

type Family = {
  relation: string;
  alive: string;
  name: string;
  idNo: string;
  job: string;
  militaryRank: string;
};

/** Port of `discount.ts` + the `tuition.discount.get` mapping. */
export async function getDiscount() {
  const help = await ajaxPostJson('/YSJStu/YSJSTU/YSJSTU_QryNotify', [['Qmodel', '']]);
  const data = await ajaxPostJson('/YSJStu/YSJSTU/YSJStu_PageLoad');
  if (!(help.IsOK && data.IsOK)) throw new SessionExpiredError(data.MSG || undefined);

  const r = data.rmodel ?? {};
  const mapFamily = (f: any): Family => ({
    relation: f?.Relation ?? '',
    alive: f?.Alive ?? '',
    name: f?.Name ?? '',
    idNo: f?.IdNo ?? '',
    job: f?.Job ?? '',
    militaryRank: f?.MilitaryRank ?? '',
  });
  return {
    note: (help.Help as string | undefined) ?? '',
    objId: r.objid,
    applyId: r.ApplyID,
    status: r.Status,
    semiYear: r.SemiYear,
    semester: r.Semistry,
    stage: r.Stage,
    studentId: r.StuId,
    studentName: r.StuName,
    orgName: r.OrgName,
    dayNight: r.DayNight,
    newsStr: r.NewsStr,
    isApply: r.IsApply,
    needCertified: r.NeedCertified,
    phoneNumber: r.PhoneNumber ?? '',
    mobileNumber: r.MobileNumber ?? '',
    email: r.Email ?? '',
    identity: r.Iden,
    originalClan: r.OrigClan ?? '',
    isBoarder: r.IsBoarders,
    idNo: r.idno,
    father: mapFamily(r.ReduceFamilyF),
    mother: mapFamily(r.ReduceFamilyM),
    guardian: mapFamily(r.ReduceFamilyG),
    spouse: mapFamily(r.ReduceFamilyS),
  };
}
