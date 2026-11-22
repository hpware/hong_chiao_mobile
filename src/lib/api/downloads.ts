import { File, Paths } from 'expo-file-system';

import {
  ApiError,
  apiOrigin,
  encodeForm,
  endpoint,
  get,
  getHiddenInputValue,
  isLoginResponseUrl,
  post,
  SessionExpiredError,
} from '@/lib/http';

type DownloadSpec = {
  /** Page that renders the `__RequestVerificationToken` for the download form. */
  tokenPage: string;
  downloadPath: string;
  pathTag: string;
  fileId: string;
  /** Bills are always PDFs; scholarship attachments can be any file type. */
  pdf: boolean;
};

function safeFileName(name: string, pdf: boolean) {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'document';
  return pdf && !/\.pdf$/i.test(cleaned) ? `${cleaned}.pdf` : cleaned;
}

export function isPdfName(name: string) {
  return /\.pdf$/i.test(name);
}

/**
 * Shared port of `bill/download.ts` and `credit-application/download.ts`:
 * fetch the anti-forgery token, POST the download form, and save the PDF into
 * the cache directory so it can be previewed or shared.
 */
async function downloadToCache(spec: DownloadSpec, fileName: string, signal?: AbortSignal) {
  const tokenPage = await get(spec.tokenPage, { signal });
  if (isLoginResponseUrl(tokenPage.url)) throw new SessionExpiredError();
  if (!tokenPage.ok) throw new ApiError(`無法取得下載驗證資訊：${tokenPage.status}`);
  const token = getHiddenInputValue(await tokenPage.text(), '__RequestVerificationToken');
  if (!token) throw new ApiError('下載頁面缺少驗證資訊');

  const response = await post(spec.downloadPath, {
    signal,
    headers: {
      Accept: 'application/pdf, application/octet-stream, */*',
      Origin: apiOrigin(),
      Referer: endpoint(spec.tokenPage),
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body: encodeForm([
      ['PathTag', spec.pathTag],
      ['FileId', spec.fileId],
      ['ShowFileName', spec.fileId],
      ['__RequestVerificationToken', token],
    ]),
  });
  if (isLoginResponseUrl(response.url)) throw new SessionExpiredError();
  if (!response.ok) throw new ApiError(`下載檔案失敗：上游回應 ${response.status}`);

  const bytes = new Uint8Array(await response.arrayBuffer());
  // "%PDF" — guard against the portal returning an HTML error page with 200.
  if (spec.pdf && !(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
    throw new ApiError('下載檔案失敗：校務系統沒有回傳 PDF');
  }

  const name = safeFileName(fileName, spec.pdf);
  const file = new File(Paths.cache, `${Date.now()}-${name}`);
  file.create({ overwrite: true });
  await file.write(bytes);
  return { uri: file.uri, name };
}

/** Tuition bill / balance bill (`TuitionBill`) or proof of payment (`Temp`). */
export function downloadBillPdf(
  pathTag: 'TuitionBill' | 'Temp',
  id: string,
  fileName: string,
  signal?: AbortSignal,
) {
  return downloadToCache(
    {
      tokenPage: '/YMR_Stu/YMR/StuPayCertifyDownLoad',
      downloadPath: '/YMR_Stu/YMR/DownLoad',
      pathTag,
      fileId: `${id}.pdf`,
      pdf: true,
    },
    fileName,
    signal,
  );
}

/** Scholarship application attachment. */
export function downloadScholarshipDocument(fileTitle: string, fileName: string, signal?: AbortSignal) {
  return downloadToCache(
    {
      tokenPage: '/YSKStu/YSKStu/YSK11SDetail',
      downloadPath: '/YSKStu/YSKStu/DownLoad',
      pathTag: 'YSKStuTemp',
      fileId: fileTitle,
      pdf: false,
    },
    fileName,
    signal,
  );
}
