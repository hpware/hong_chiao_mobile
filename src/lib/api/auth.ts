import {
  ApiError,
  ajaxGet,
  ajaxPost,
  encodeForm,
  endpoint,
  get,
  getHiddenInputValue,
  isLoginResponseUrl,
  post,
  SessionExpiredError,
} from '@/lib/http';

/** Port of `user/captcha.ts`. Loading Login.aspx first gives us a fresh ASP.NET session. */
export async function getCaptcha() {
  const started = Date.now();
  await get('/B2KPortal/Login.aspx');
  const response = await ajaxGet('/B2KPortal/Account/CreateValidateCode');
  const text = await response.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError('驗證碼端點沒有回傳 JSON，請確認校務系統網址是否正確。');
  }
  const image: string | null = json?.[1]?.ImgSrc ?? null;
  if (!image) throw new ApiError('無法取得驗證碼圖片');
  return { image, duration: (Date.now() - started) / 1000 };
}

/** Port of `user/login.ts`. */
export async function login(rawUsername: string, rawPassword: string, rawCaptcha: string) {
  const started = Date.now();
  // NFKC folds full-width input from CJK keyboards (５１３…, ＡＢＣ) into ASCII.
  // The portal's password rules only allow ASCII, so this never changes a valid password.
  const username = rawUsername.normalize('NFKC').trim();
  const password = rawPassword.normalize('NFKC');
  const captcha = rawCaptcha.normalize('NFKC').trim();
  const loginUrl = endpoint('/B2KPortal/Login.aspx');
  const loginPage = await get('/B2KPortal/Login.aspx');
  const token = getHiddenInputValue(await loginPage.text(), '__RequestVerificationToken');

  const response = await post('/B2KPortal/Login.aspx', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: encodeForm([
      ['__RequestVerificationToken', token],
      ['LoginMode', ''],
      ['LoginID', username],
      ['Password', password],
      ['ValidateCode', captcha],
      ['ClearLock', '0'],
    ]),
  });
  const html = await response.text();
  const hdfText = getHiddenInputValue(html, 'hdfMessage');
  // The login form is only rendered on Login.aspx, so its presence is a second,
  // URL-independent signal that the portal sent us back to the login page.
  const showsLoginForm = /<input\b[^>]*\bid=["']LoginID["']/i.test(html);
  const success =
    response.url !== loginUrl && !isLoginResponseUrl(response.url) && !showsLoginForm;

  if (!success) {
    throw new ApiError(hdfText || '登入失敗，請檢查您的帳號密碼和驗證碼。');
  }
  return {
    changePasswordNotice: response.url.endsWith('/Account/ChangePassword'),
    duration: (Date.now() - started) / 1000,
  };
}

/** Port of `user/logout.ts`. Errors are swallowed: we log out locally regardless. */
export async function logoutRemote() {
  try {
    await ajaxPost('/B2KPortal/B2KPortal/ReUrlContent');
    await ajaxPost('/B2KPortal/B2KPortal/Logout');
  } catch {
    // ignore
  }
}

/** Port of `user/renewTimeoutTimer.ts` + the `renewTimer` procedure. */
export async function renewTimer() {
  const response = await ajaxPost('/B2KPortal/B2KPortal/ReUrlContent');
  const body = (await response.text()).trim();
  if (body === 'OK') return true;
  if (response.status === 401 || response.status === 403 || isLoginResponseUrl(response.url)) {
    throw new SessionExpiredError();
  }
  throw new ApiError('無法更新 Session，請稍後再試。');
}

/** Port of `user/name.ts`. */
export async function getUserName() {
  const response = await ajaxGet('/YStuQuery/YStuQuery/YSDStuMain');
  if (isLoginResponseUrl(response.url)) throw new SessionExpiredError();
  const text = await response.text();
  const match = text.match(/<label>學生姓名：<\/label>\s*<label>([^<]+)<\/label>/);
  return match?.[1]?.trim() ?? '';
}

export const passwordRule = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d&!@#$%^*()+=_~]{8,20}$/;
export const passwordRuleMessage =
  '密碼需要包含 8~20 位的英文大小寫與數字，並僅可以包含這些符號 &!@#$%^*()+=_~。';

/** Port of `user/changePassword.ts`. */
export async function changePassword(newPassword: string) {
  if (!passwordRule.test(newPassword)) throw new ApiError(passwordRuleMessage);
  const started = Date.now();
  const response = await ajaxPost('/B2KPortal/Account/ChangePassword', [
    ['Password', newPassword],
    ['ConfirmPassword', newPassword],
    ['IsChgPsW', 'False'],
  ]);
  if (isLoginResponseUrl(response.url)) throw new SessionExpiredError();
  const html = await response.text();
  const hdfText = getHiddenInputValue(html, 'hdfMessage');
  const message = (hdfText || `更換密碼失敗，遠端伺服器回應 ${response.status}。`).replace(
    '-clXObjS.SBAS:-clYObjS_BAS.BASSaveUserRole:-SBAS_SaveUserRole:',
    '',
  );
  if (hdfText !== 'OK') throw new ApiError(message);
  return { duration: (Date.now() - started) / 1000 };
}

/** Port of `fetch_user_semis.ts`: every semester the student has been enrolled in, newest first. */
export async function getParticipatingSemesters() {
  const response = await ajaxGet('/YMR_Stu/YMR/StuPayCertifyDownLoad');
  if (isLoginResponseUrl(response.url)) throw new SessionExpiredError();
  const html = await response.text();
  const seen = new Set<string>();
  return [...html.matchAll(/SemiYear="(\d+)"\s+Semi="(\d+)"/g)]
    .map((m) => ({ year: Number(m[1]), semi: Number(m[2]) }))
    .filter((s) => {
      const key = `${s.year}-${s.semi}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.year - a.year || b.semi - a.semi);
}
