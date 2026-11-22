import Constants from 'expo-constants';

import { router } from 'expo-router';

import { openInApp } from '@/lib/browser';
import { NavRow, Screen, Section, ValueRow } from '@/components/native';
import { useSession } from '@/providers/session';

/** Ports `/platform/about`. */
export default function AboutScreen() {
  const session = useSession();
  return (
    <Screen>
      <Section footer="管城市在手機上直接連線到學校的校務系統，不經過任何中介伺服器。管城市並非學校或廠商開發，校務系統的變更都可能影響它的運作。">
        <ValueRow label="App" value="管城市" />
        <ValueRow label="版本" value={`${Constants.expoConfig?.version ?? ""} (${Constants.expoConfig?.ios?.buildNumber ?? "1"})`} />
        <ValueRow label="Expo SDK" value={Constants.expoConfig?.sdkVersion} />
        <ValueRow label="校務系統" value={session.apiUrl} />
      </Section>
      <Section footer="想改點什麼嗎？歡迎 Fork 這個專案並送出 PR。">
        <NavRow
          title="GitHub 原始碼"
          icon="chevron.left.forwardslash.chevron.right"
          external
          onPress={() => openInApp('https://github.com/hpware/hong_chiao_mobile')}
        />
      </Section>
      <Section>
        <NavRow title="授權條款" icon="doc.text" onPress={() => router.push('/licenses')} />
      </Section>
    </Screen>
  );
}
