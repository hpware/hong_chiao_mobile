import { router } from 'expo-router';

import { NavRow, Screen, Section, Status } from '@/components/native';
import { useLegacyStatus } from '@/lib/old/client';

/** 學業: the features that still live in the legacy system (舊系統). Today's classes are on 首頁 and 課表. */
export default function SchoolScreen() {
  const ready = useLegacyStatus() === 'ready';

  if (!ready) {
    return (
      <Status
        title="需要舊系統密碼"
        icon="key"
        message="成績、缺曠與請假來自舊系統（siw）。輸入一次舊系統密碼，之後就不會再問。"
        actionTitle="輸入密碼"
        onAction={() => router.push('/legacy-password')}
      />
    );
  }

  return (
    <Screen>
      <Section title="成績">
        <NavRow title="成績" subtitle="學期成績、期中成績與歷年趨勢" icon="graduationcap" onPress={() => router.push('/grades')} />
      </Section>

      <Section title="出缺勤">
        <NavRow title="缺曠紀錄" icon="calendar.badge.exclamationmark" onPress={() => router.push('/absence')} />
        <NavRow title="請假" icon="figure.walk.departure" onPress={() => router.push('/leaves')} />
        <NavRow title="獎懲" icon="rosette" onPress={() => router.push('/rewards')} />
      </Section>

      <Section title="課程">
        <NavRow title="開課查詢" subtitle="依科目、教師或科系搜尋開課資料" icon="magnifyingglass" onPress={() => router.push('/course-search')} />
        <NavRow title="班級課表" subtitle="任一班級的一週課表" icon="person.3" onPress={() => router.push({ pathname: '/timetables', params: { mode: 'class' } })} />
        <NavRow title="教師課表" subtitle="任一位老師的授課時間" icon="person.crop.rectangle" onPress={() => router.push({ pathname: '/timetables', params: { mode: 'teacher' } })} />
      </Section>

      <Section title="生活">
        <NavRow title="校園地圖" subtitle="大樓位置、樓層與教室" icon="map" onPress={() => router.push('/campus-map')} />
        <NavRow title="信件" subtitle="收發室待領取的信件與包裹、領取紀錄" icon="envelope" onPress={() => router.push('/mail')} />
      </Section>

      <Section footer="選課、教學評量、宿舍與社團申請等，以舊系統原始網頁開啟。">
        <NavRow title="舊系統所有功能" icon="square.grid.2x2" onPress={() => router.push('/legacy-all')} />
      </Section>
    </Screen>
  );
}
