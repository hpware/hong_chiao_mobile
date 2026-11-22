import { useQuery } from '@tanstack/react-query';
import { router, Stack, type Href } from 'expo-router';
import { useState } from 'react';

import { Loading, NavRow, Screen, Section, Status, TextRow } from '@/components/native';
import { getLegacyMenu } from '@/lib/old/api';

/** siw functions that have a native screen; everything else opens in the in-app browser. */
const NATIVE: Record<string, Href> = {
  AG102: '/grades',
  AK002: '/absence',
  AK010: '/rewards',
  CK001: '/leaves',
  ZGC201: '/bill',
  ZTT001: '/mail',
  AG203: '/course-search',
  AG300: { pathname: '/timetables', params: { mode: 'teacher' } },
  AG304: { pathname: '/timetables', params: { mode: 'class' } },
};

/** Covered elsewhere: 我的課表 is the 課表 tab; 學期/期中成績 are part of 成績. */
const HIDDEN = new Set(['AG222', 'AG008', 'AG009']);

/** Every function on the siw menu, in the menu's order. */
export default function LegacyAllScreen() {
  const menu = useQuery({ queryKey: ['legacy', 'menu'], queryFn: getLegacyMenu, staleTime: Infinity });
  const [query, setQuery] = useState('');
  const searchBar = (
    <Stack.SearchBar placeholder="搜尋功能" onChangeText={(e) => setQuery(e.nativeEvent.text)} onCancelButtonPress={() => setQuery('')} />
  );

  if (menu.isPending) return <>{searchBar}<Loading text="正在讀取舊系統選單…" /></>;
  if (menu.error) {
    return <Status title="無法載入選單" message={menu.error.message} actionTitle="重試" onAction={() => menu.refetch()} />;
  }

  const q = query.trim().toLowerCase();
  const items = menu.data.filter(
    (f) => !HIDDEN.has(f.fncid) && (!q || f.name.toLowerCase().includes(q) || f.fncid.toLowerCase().includes(q)),
  );
  const native = items.filter((f) => NATIVE[f.fncid]);
  const web = items.filter((f) => !NATIVE[f.fncid]);

  return (
    <Screen onRefresh={() => menu.refetch()}>
      {searchBar}
      {items.length === 0 ? (
        <Section>
          <TextRow body={`找不到「${query.trim()}」相關的功能。`} tone="secondary" />
        </Section>
      ) : null}
      {native.length > 0 ? <Section title="App 內建">
        {native.map((f) => (
          <NavRow key={f.fncid} title={f.name} onPress={() => router.push(NATIVE[f.fncid])} />
        ))}
      </Section> : null}
      {web.length > 0 ? <Section title="其他功能" footer="這些功能會以舊系統的原始網頁開啟，並沿用 App 的登入。">
        {web.map((f) => (
          <NavRow
            key={f.fncid}
            title={f.name}
            onPress={() => router.push({ pathname: '/legacy-web', params: { fncid: f.fncid, title: f.name } })}
          />
        ))}
      </Section> : null}
    </Screen>
  );
}
