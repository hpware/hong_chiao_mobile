import data from '@/generated/licenses.json';

/** Licenses shown on the 授權條款 screen. Third-party ones come from scripts/generate-licenses.js. */

export type LicensePackage = {
  name: string;
  version: string;
  license: string;
  author?: string;
  repository?: string;
  text: number | null;
};

export const PACKAGES = data.packages as LicensePackage[];
const TEXTS = data.texts as string[];

export function licenseText(pkg: LicensePackage) {
  return pkg.text === null ? null : TEXTS[pkg.text];
}

const MIT = (holder: string) => `MIT License

Copyright (c) ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

/** This app and the projects it's built from. */
export const PROJECTS = [
  {
    id: 'app',
    name: '管城市',
    detail: 'MIT · Yuan-Hau Wu',
    note: '本 App。',
    url: undefined as string | undefined,
    text: MIT('2026 Yuan-Hau Wu'),
  },
  {
    id: 'hong-chiao',
    name: 'hong_chiao',
    detail: 'MIT · Yuan-Hau Wu',
    note: '原本的網頁版（Next.js）；新校務系統的串接與畫面移植自此專案。',
    url: 'https://github.com/hpware/hong_chiao',
    text: MIT('2026 Yuan-Hau Wu'),
  },
  {
    id: 'agora-ai',
    name: 'Agora-AI',
    detail: 'alaner652',
    note: '舊校務系統（siw）的串接與解析移植自此專案的後端。',
    url: 'https://github.com/alaner652/Agora-AI',
    text: '原專案未附授權條款，著作權屬原作者 alaner652 所有。',
  },
  {
    id: 'osm',
    name: 'OpenStreetMap',
    detail: 'ODbL · OpenStreetMap 貢獻者',
    note: '校園地圖上的大樓位置與輪廓。',
    url: 'https://www.openstreetmap.org/copyright',
    text: '地圖資料 © OpenStreetMap 貢獻者，以開放資料庫授權條款（ODbL 1.0）授權：https://opendatacommons.org/licenses/odbl/1-0/',
  },
  {
    id: 'expo',
    name: 'Expo 範本',
    detail: 'MIT · 650 Industries, Inc. (aka Expo)',
    note: '本 App 以 Expo 的 App 範本為起點。',
    url: 'https://github.com/expo/expo',
    text: MIT('2015-present 650 Industries, Inc. (aka Expo)'),
  },
];
