import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { Appearance } from 'react-native';

import { getItem, setItem, StorageKeys } from '@/lib/storage';

export type ThemePreference = 'system' | 'light' | 'dark';

const ThemePreferenceContext = createContext<{
  preference: ThemePreference;
  setPreference: (value: ThemePreference) => void;
}>({ preference: 'system', setPreference: () => {} });

function apply(preference: ThemePreference) {
  Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
}

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    getItem(StorageKeys.theme).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setPreferenceState(stored);
        apply(stored);
      }
    });
  }, []);

  const setPreference = (value: ThemePreference) => {
    setPreferenceState(value);
    apply(value);
    setItem(StorageKeys.theme, value);
  };

  return (
    <ThemePreferenceContext value={{ preference, setPreference }}>{children}</ThemePreferenceContext>
  );
}

export function useThemePreference() {
  return use(ThemePreferenceContext);
}
