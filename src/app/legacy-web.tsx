import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { WebView } from 'react-native-webview';

import { openInApp } from '@/lib/browser';
import { Loading, Status } from '@/components/native';
import { USER_AGENT } from '@/lib/http';
import { ensureLegacySession, legacyOrigin } from '@/lib/old/client';

/**
 * siw pages run inside a frameset (banner / menu / Main) and poke at `top.banner`, then submit
 * forms into the "Main" frame. Outside that frameset we stub the banner and keep every form and
 * link in this page, so each function works on its own.
 */
const FRAMESET_SHIM = `
(function () {
  var stub = { disabled: false, click: function () {}, style: {} };
  var bannerDoc = { all: function () { return stub; }, getElementById: function () { return stub; } };
  try { window.banner = { document: bannerDoc }; } catch (e) {}
  var submit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () { this.target = '_self'; return submit.call(this); };
  document.addEventListener('submit', function (e) { if (e.target) e.target.target = '_self'; }, true);
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[target]');
    if (a) a.target = '_self';
  }, true);
  var meta = document.createElement('meta');
  meta.name = 'viewport';
  meta.content = 'width=device-width, initial-scale=1';
  (document.head || document.documentElement).appendChild(meta);
})();
true;`;

/** Opens any siw function (by its menu id) in an in-app browser that shares the app's siw login. */
export default function LegacyWebScreen() {
  const { fncid, title } = useLocalSearchParams<{ fncid: string; title?: string }>();
  // react-native-webview's class typing doesn't line up with React 19 refs; we only call reload().
  const web = useRef<{ reload: () => void } | null>(null);
  // Resolves to the host the session lives on, so the page opens there (its cookie is per host).
  const session = useQuery({ queryKey: ['legacy', 'session'], queryFn: () => ensureLegacySession().then(() => legacyOrigin()), gcTime: 0 });
  const origin = session.data ?? '';

  return (
    <>
      <Stack.Screen options={{ title: title || '舊系統' }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="arrow.clockwise" accessibilityLabel="重新整理" onPress={() => web.current?.reload()} />
      </Stack.Toolbar>
      {session.isPending ? (
        <Loading text="正在連線到舊系統…" />
      ) : session.error ? (
        <Status title="無法連線到舊系統" message={session.error.message} actionTitle="重試" onAction={() => session.refetch()} />
      ) : (
        <WebView
          ref={web as never}
          style={{ flex: 1 }}
          source={{
            uri: `${origin}/tsint/fnc.jsp`,
            method: 'POST',
            body: `fncid=${encodeURIComponent(fncid)}`,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          }}
          userAgent={USER_AGENT}
          sharedCookiesEnabled
          // Non-persistent store: a previous student's siw cookie can't survive here and be
          // copied back into the app's cookie store.
          incognito
          thirdPartyCookiesEnabled
          injectedJavaScriptBeforeContentLoaded={FRAMESET_SHIM}
          injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
          injectedJavaScriptForMainFrameOnly={false}
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures
          contentInsetAdjustmentBehavior="automatic"
          startInLoadingState
          onShouldStartLoadWithRequest={(req: { url: string }) => {
            // Leave the school's other sites (and mailto:, etc.) to the system browser.
            if (req.url.startsWith(origin) || req.url === 'about:blank') return true;
            if (/^https?:/.test(req.url)) void openInApp(req.url);
            return false;
          }}
        />
      )}
    </>
  );
}
