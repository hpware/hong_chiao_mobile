import { ajaxPost, ajaxPostJson, ajaxPostMultipart, ApiError, parseJsonResponse, SessionExpiredError } from '@/lib/http';
import type { PickedFile } from '@/lib/multipart';

export type ScholarshipDocument = {
  No: string;
  Code: string;
  Choose: string;
  FileTitle: string;
  ShowFileName: string;
  SPath: string;
  DPath: string;
};

export type Scholarship = {
  objid: string;
  SemiYear: string;
  Semistry: string;
  Code: string;
  Title: string;
  UnOrgText: string;
  UnPerText: string;
  Memo: string;
  Status: string;
  StatusText: string;
  Quota: string;
  Apply: string;
  Method: string;
  URL: string;
  StartDate: string;
  EndDate: string;
  UpLoadDate: string;
  DocList?: ScholarshipDocument[];
};

function rowsFrom(obj: any): Scholarship[] {
  if (Array.isArray(obj)) return obj;
  if (Array.isArray(obj?.DataList)) return obj.DataList;
  if (obj && typeof obj === 'object' && obj.objid != null) return [obj];
  return [];
}

/** Port of `credit-application/index.ts` (list mode). */
export async function listScholarships() {
  const data = await ajaxPostJson('/YSKStu/YSKStu/YSK11_Qry', [['ppqmodel[IsStu]', '1']]);
  if (!data.OK) throw new SessionExpiredError(data.MSG || undefined);
  return rowsFrom(data.obj);
}

/** Port of `credit-application/index.ts` (detail mode) + the `details` procedure. */
export async function getScholarship(id: string) {
  const data = await ajaxPostJson('/YSKStu/YSKStu/YSK11_Qry', [
    ['ppqmodel[IsStu]', '1'],
    ['ppqmodel[objid]', id],
    ['ppqmodel[IsDtl]', '1'],
  ]);
  if (!data.OK) throw new SessionExpiredError(data.MSG || undefined);
  const rows = rowsFrom(data.obj);
  if (rows.length === 0) throw new ApiError('此 Object ID 沒有任何資訊 😥');
  return rows[0];
}

// ---------------------------------------------------------------------------
// Applying: mirrors the portal's YSK11SDetail page (QryApply / 上傳 / SaveClick / SentClick).
// The web app never implemented this; the protocol was read from the portal's own page script.

/** A file attached to one required document (as the portal stores it). */
export type UploadedFile = { showName: string; dPath: string; sPath: string; fileTitle: string };

export type ScholarshipApplication = {
  objid: string;
  descript: string;
  /** 0 = 草稿, 10 = 已送出, 11/21 = 退回補件 (editable again), others = 審核中/已核定. */
  status: string;
  statusText: string;
  reason: string;
  /** Uploaded file per document code (DocList[].Code). */
  files: Record<string, UploadedFile>;
};

/** Statuses in which the student may still change and (re)send the application. */
export function isEditable(status: string | undefined) {
  return !status || status === '0' || status === '11' || status === '21';
}

const rmFields = (id: string): [string, string][] => [
  ['ppqmodel[RMID]', id],
  ['ppqmodel[RMDtlID]', ''],
];

/** The student's application for a scholarship, or `null` if they haven't saved one yet. */
export async function getApplication(id: string): Promise<ScholarshipApplication | null> {
  await ajaxPost('/YSKStu/YSKStu/YSK11SDetail', rmFields(id)); // opens the page server-side, like the browser
  const data = await ajaxPostJson('/YSKStu/YSKStu/YSK11SDetail_Qry', rmFields(id));
  if (!data.OK) throw new ApiError(data.MSG || '無法取得申請資料');
  const item = (Array.isArray(data.obj) ? data.obj : [data.obj]).find((x: any) => x && x.objid != null);
  if (!item) return null;
  const files: Record<string, UploadedFile> = {};
  for (const a of item.AppendidxS ?? []) {
    if (a?.DPath || a?.FileTitle) {
      files[a.InId] = { showName: a.ShowFileName ?? '', dPath: a.DPath ?? '', sPath: a.SPath ?? '', fileTitle: a.FileTitle ?? '' };
    }
  }
  return {
    objid: String(item.objid),
    descript: item.Descript ?? '',
    status: String(item.Status ?? '0'),
    statusText: item.StatusText ?? '',
    reason: item.Reason ?? '',
    files,
  };
}

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

/** Uploads one document to the portal (its 上傳檔案 dialog). Up to 3 MB. */
export async function uploadScholarshipFile(file: PickedFile): Promise<UploadedFile> {
  if (file.bytes.length > MAX_UPLOAD_BYTES) throw new ApiError('檔案超過 3 MB 的上限。');
  // The dialog is requested first; the server keeps its settings for the upload that follows.
  await ajaxPost('/YSKStu/UploadFile/UploadFileToFTP2', [
    ['WhoCall', 'YSK11'],
    ['UploadFileMaxSizeInt', String(MAX_UPLOAD_BYTES)],
    ['UploadFileMaxSizeIntK', '3072'],
    ['UploadFileMaxSizeIntM', '3'],
    ['CtrlName_Upload', 'YSKStu'],
    ['FuncName_Upload', 'UpLoadAppendidx'],
  ]);
  const response = await ajaxPostMultipart('/YSKStu/UploadFile/UploadedFile', [
    { name: 'UploadFile0', filename: file.name, contentType: file.contentType, bytes: file.bytes },
    { name: 'WhoCall', value: 'YSK11' },
    { name: 'UploadFileMaxSizeIntM', value: '3' },
    { name: 'IsToFTP', value: '1' },
  ]);
  const data = await parseJsonResponse<string[]>(response);
  if (!Array.isArray(data) || data[0] !== 'OK') throw new ApiError((Array.isArray(data) && data[0]) || '上傳失敗');
  return { showName: data[1], dPath: data[2], sPath: data[3], fileTitle: data[4] };
}

/** 儲存: creates or updates the draft. Returns its objid. */
export async function saveApplication(options: {
  id: string;
  objid?: string;
  descript: string;
  documents: ScholarshipDocument[];
  files: Record<string, UploadedFile>;
}) {
  const fields: [string, string][] = [
    ['ppqmodel[objid]', options.objid ?? ''],
    ...rmFields(options.id),
    ['ppqmodel[Descript]', options.descript],
  ];
  options.documents.forEach((doc, i) => {
    const f = options.files[doc.Code];
    fields.push(
      [`ppqmodel[AppendidxS][${i}][InId]`, doc.Code],
      [`ppqmodel[AppendidxS][${i}][ShowFileName]`, f?.showName ?? ''],
      [`ppqmodel[AppendidxS][${i}][DPath]`, f?.dPath ?? ''],
      [`ppqmodel[AppendidxS][${i}][SPath]`, f?.sPath ?? ''],
      [`ppqmodel[AppendidxS][${i}][FileTitle]`, f?.fileTitle ?? ''],
    );
  });
  const data = await ajaxPostJson('/YSKStu/YSKStu/YSK11_Save', fields);
  if (!data.OK) throw new ApiError(data.MSG || '儲存失敗');
  return String(data.obj?.objid ?? options.objid ?? '');
}

/** 送出: submits a saved application for review. */
export async function sendApplication(objid: string) {
  const data = await ajaxPostJson('/YSKStu/YSKStu/YSK11_Save', [
    ['ppqmodel[objid]', objid],
    ['ppqmodel[Status]', '10'],
    ['ppqmodel[IsSent]', '1'],
  ]);
  if (!data.OK) throw new ApiError(data.MSG || '送出失敗');
}
