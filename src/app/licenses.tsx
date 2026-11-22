import { router } from 'expo-router';

import { NavRow, Screen, Section } from '@/components/native';
import { PACKAGES, PROJECTS } from '@/lib/licenses';

/** 授權條款: this app, the projects it's built from, and every bundled open-source package. */
export default function LicensesScreen() {
  return (
    <Screen>
      <Section title="專案">
        {PROJECTS.map((p) => (
          <NavRow key={p.id} title={p.name} subtitle={p.detail} onPress={() => router.push({ pathname: '/license', params: { project: p.id } })} />
        ))}
      </Section>
      <Section title={`開源套件（${PACKAGES.length}）`} footer="感謝所有開源專案的作者。">
        {PACKAGES.map((p, i) => (
          <NavRow
            key={`${p.name}@${p.version}`}
            title={p.name}
            subtitle={`${p.version} · ${p.license}`}
            onPress={() => router.push({ pathname: '/license', params: { pkg: String(i) } })}
          />
        ))}
      </Section>
    </Screen>
  );
}
