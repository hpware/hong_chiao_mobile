import { Stack, useLocalSearchParams } from 'expo-router';

import { NavRow, Screen, Section, TextRow, ValueRow } from '@/components/native';
import { openInApp } from '@/lib/browser';
import { licenseText, PACKAGES, PROJECTS } from '@/lib/licenses';

/** One project's or package's license text. */
export default function LicenseScreen() {
  const { project, pkg } = useLocalSearchParams<{ project?: string; pkg?: string }>();
  const proj = PROJECTS.find((p) => p.id === project);
  const item = pkg !== undefined ? PACKAGES[Number(pkg)] : undefined;

  const title = proj?.name ?? item?.name ?? '授權條款';
  const url = proj?.url ?? (item?.repository?.startsWith('http') ? item.repository : undefined);
  const text = proj?.text ?? (item ? licenseText(item) : null);

  return (
    <Screen>
      <Stack.Screen options={{ title }} />
      <Section footer={proj?.note}>
        {item ? (
          <>
            <ValueRow label="版本" value={item.version} />
            <ValueRow label="授權" value={item.license} />
            {item.author ? <ValueRow label="作者" value={item.author} /> : null}
          </>
        ) : (
          <ValueRow label="授權" value={proj?.detail} />
        )}
        {url ? <NavRow title="原始碼" icon="chevron.left.forwardslash.chevron.right" external onPress={() => openInApp(url)} /> : null}
      </Section>
      <Section title="授權全文">
        <TextRow body={text ?? `此套件未附授權全文，授權為 ${item?.license ?? '未標示'}。`} />
      </Section>
    </Screen>
  );
}
