import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider, useSession } from '@/providers/session';
import { ThemePreferenceProvider } from '@/providers/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemePreferenceProvider>
        <SessionProvider>
          <RootNavigator />
        </SessionProvider>
      </ThemePreferenceProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { status } = useSession();
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  // iOS grouped-list background, so screen transitions match the native forms.
  const background = dark ? '#000000' : '#F2F2F7';
  const base = dark ? DarkTheme : DefaultTheme;

  useEffect(() => {
    if (status !== 'booting') SplashScreen.hideAsync();
  }, [status]);

  if (status === 'booting') return null;
  const signedIn = status === 'signedIn';

  return (
    <ThemeProvider
      value={{
        ...base,
        colors: { ...base.colors, background },
      }}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="bill" options={{ title: '繳費單' }} />
          <Stack.Screen name="proof" options={{ title: '繳費證明' }} />
          <Stack.Screen name="discount" options={{ title: '抵免申請' }} />
          <Stack.Screen name="scholarship/[id]" options={{ title: '獎學金' }} />
          <Stack.Screen name="scholarship/document" options={{ title: '申請文件' }} />
          <Stack.Screen name="about" options={{ title: '關於' }} />
          <Stack.Screen name="licenses" options={{ title: '授權條款' }} />
          <Stack.Screen name="campus-map" options={{ title: '校園地圖' }} />
          <Stack.Screen name="license" options={{ title: '授權條款' }} />
          <Stack.Screen name="change-password" options={{ title: '', presentation: 'formSheet', sheetGrabberVisible: true, sheetAllowedDetents: [0.75, 1] }} />
          <Stack.Screen name="tuition" options={{ title: '學費' }} />
          <Stack.Screen name="mail" options={{ title: '信件' }} />
          <Stack.Screen name="course-search" options={{ title: '開課查詢' }} />
          <Stack.Screen name="timetables" options={{ title: '課表查詢' }} />
          <Stack.Screen name="course" options={{ title: '', presentation: 'formSheet', sheetGrabberVisible: true, sheetAllowedDetents: [0.5, 1] }} />
          <Stack.Screen name="grades" options={{ title: '成績' }} />
          <Stack.Screen name="absence" options={{ title: '缺曠紀錄' }} />
          <Stack.Screen name="leaves" options={{ title: '請假' }} />
          <Stack.Screen name="leave-new" options={{ title: '新增假單', presentation: 'modal' }} />
          <Stack.Screen name="rewards" options={{ title: '獎懲' }} />
          <Stack.Screen name="legacy-all" options={{ title: '舊系統所有功能' }} />
          <Stack.Screen name="legacy-web" options={{ title: '舊系統' }} />
          <Stack.Screen name="legacy-password" options={{ title: '', presentation: 'formSheet', sheetGrabberVisible: true, sheetAllowedDetents: [0.75, 1] }} />
        </Stack.Protected>
        {/* Reachable signed out too: the login screen links here when the portal is down. */}
        <Stack.Screen name="status" options={{ title: '系統狀態' }} />
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" options={{ title: '登入', headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
