import { parse } from 'node-html-parser';

import { ajaxGet, ajaxPostJson, isLoginResponseUrl, SessionExpiredError } from '@/lib/http';

export type HomeData = {
  leaves: { type: string; data: number | string }[];
  absent: unknown[];
};

/** Port of `home/data.ts` + `mapHomeData`. */
export async function getHomeData(year: number, semistry: number): Promise<HomeData> {
  const data = await ajaxPostJson('/YStuQuery/YStuQuery/YSDStuMain_Qry', [
    ['__RequestVerificationToken', ''],
    ['ppqmodel[SemiYear]', String(year)],
    ['ppqmodel[Semistry]', String(semistry)],
  ]);
  if (!data.OK) throw new SessionExpiredError(data.MSG || undefined);
  const score = data.obj?.Score;
  return {
    leaves: [
      { type: '曠課', data: score?.Item1 ?? '' },
      { type: '病假', data: score?.Item2 ?? '' },
      { type: '公假', data: score?.Item3 ?? '' },
      { type: '事假', data: score?.Item4 ?? '' },
      { type: '喪假', data: score?.Item5 ?? '' },
      { type: '產假', data: score?.Item6 ?? '' },
      { type: '操行分數', data: score?.Item7 ?? '' },
    ],
    absent: data.obj?.Absent ?? [],
  };
}

export type Announcement = { unit: string; date: string; content: string };

function normalizeText(text: string | null | undefined) {
  return (
    text
      ?.replace(/ /g, ' ')
      .replace(/&nbsp;/g, ' ')
      .trim() ?? ''
  );
}

function splitLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Port of `home/announcements.ts` (cheerio → node-html-parser). */
export async function getAnnouncements(): Promise<Announcement[]> {
  const response = await ajaxGet('/B2KPortal');
  if (response.status !== 200 || isLoginResponseUrl(response.url)) {
    throw new SessionExpiredError();
  }
  const root = parse(await response.text());
  const rows = root.querySelectorAll('#tblistOfAnnounce tbody tr');
  const announcements: Announcement[] = [];

  for (const row of rows) {
    const [unitCell, dateCell, topicCell] = row.querySelectorAll('td');
    const labels = topicCell
      ? topicCell
          .querySelectorAll('label')
          .map((label) => normalizeText(label.text))
          .filter(Boolean)
      : [];
    const [title = '', ...contentLabels] = labels;
    const announcement = {
      unit: normalizeText(unitCell?.text),
      date: normalizeText(dateCell?.text),
      content: [...(title ? [title] : []), ...contentLabels.flatMap(splitLines)].join('\n'),
    };
    if (announcement.unit || announcement.date || announcement.content) {
      announcements.push(announcement);
    }
  }
  return announcements;
}

/** Port of `home/features.ts` (only the `discount` feature exists). */
export async function isDiscountEnabled() {
  const result = await ajaxPostJson('/YSJStu/YSJSTU/YSJSTU_QryNotify', [['Qmodel', '']]);
  // The web app names this flag `disabled` and enables the page when it is false.
  return result.isOK !== true;
}
