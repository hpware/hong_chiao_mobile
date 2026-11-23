import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getCaptcha, login } from '@/lib/api/auth';
import { getUptime, isDownStatus, schoolSystemsStatus, statusLabel, type MonitorStatus } from '@/lib/api/school-site';
import { type Outage, useOutage } from '@/lib/outage';
import { systemColor } from '@/lib/colors';
import { SYSTEM_NAMES, useSchoolSystems as useSystems } from '@/components/system-status';
import { readCaptcha } from '@/lib/captcha-ocr';
import { loadPortalPassword, savePortalPassword } from '@/lib/credentials';
import { ApiError, clearAllCookies } from '@/lib/http';
import { connectLegacyAccount, legacyAccepts, rememberLegacyAccount } from '@/lib/old/client';
import { useSession } from '@/providers/session';

const MAX_CAPTCHA_ATTEMPTS = 3;

/** The portal rejected the captcha itself (not the account), so it's safe to retry with a new one. */
function isCaptchaRejection(error: unknown) {
  return error instanceof ApiError && /驗證碼/.test(error.message);
}

export default function LoginScreen() {
  const session = useSession();
  const passwordRef = useRef<TextInputInstance>(null);
  const [autofilled, setAutofilled] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState(session.studentId);
  const [password, setPassword] = useState('');
  // What the user typed over the auto-read code, tied to the captcha image it was typed for.
  const [captchaEdit, setCaptchaEdit] = useState<{
    image: string;
    text: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [manualCaptcha, setManualCaptcha] = useState(false);

  const captchaQuery = useQuery({
    queryKey: ['captcha', session.apiUrl],
    queryFn: async () => {
      // Nobody is signed in on this screen: start from an empty cookie store so neither sw nor
      // siw can hand back a previous student's session.
      await clearAllCookies();
      const result = await getCaptcha();
      return { ...result, code: readCaptcha(result.image) };
    },
    staleTime: 0,
    gcTime: 0,
  });
  // A password saved at the last sign-in (removed when the user signs out themselves).
  const [savedPassword, setSavedPassword] = useState<string | null>(null);
  useEffect(() => {
    if (!session.studentId) return;
    void loadPortalPassword(session.studentId).then((pwd) => {
      if (!pwd) return;
      setPassword((cur) => cur || pwd);
      setSavedPassword(pwd);
      setAutofilled(true);
    });
  }, [session.studentId]);

  const image = captchaQuery.data?.image;
  const edited = captchaEdit && captchaEdit.image === image ? captchaEdit.text : null;
  const captcha = edited ?? captchaQuery.data?.code ?? '';

  const submit = async (pwd: string = password) => {
    const id = username.trim();
    if (!id || !pwd) {
      Alert.alert('請輸入學號與密碼');
      return;
    }
    setSubmitting(true);
    try {
      let code = captcha.trim();
      for (let attempt = 1; ; attempt++) {
        try {
          await login(id, pwd, code);
          void savePortalPassword(id, pwd);
          session.signedIn(id);
          // The legacy system (課表/成績/缺曠/請假) uses its own password, often the same one. If siw
          // rejects it (and none is saved yet), ask for the siw password once.
          void connectLegacyAccount(id, pwd).then((ok) => {
            if (!ok) router.push('/legacy-password');
          });
          return;
        } catch (e) {
          // A misread captcha costs nothing: fetch a new one, read it and try again.
          if (!isCaptchaRejection(e)) throw e;
          if (attempt >= MAX_CAPTCHA_ATTEMPTS || showCaptcha) {
            setManualCaptcha(true);
            throw e;
          }
          const next = await captchaQuery.refetch();
          code = next.data?.code ?? '';
          if (!code) {
            setManualCaptcha(true);
            throw e;
          }
        }
      }
    } catch (e) {
      captchaQuery.refetch();
      // Typed the old system's password? Then keep it for siw and ask for the portal one.
      // siw has no failed-login limit (sw does), so checking it here costs the student nothing.
      if (e instanceof ApiError && !isCaptchaRejection(e) && (await legacyAccepts({ uid: id, pwd }).catch(() => false))) {
        rememberLegacyAccount({ uid: id, pwd });
        setPassword('');
        Alert.alert(
          '這是舊系統的密碼',
          '這組密碼可以登入舊系統（siw），已安全儲存在這支 iPhone 上。新系統（sw）的密碼不同，請輸入新系統的密碼。',
        );
        return;
      }
      Alert.alert('登入失敗', e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  // The captcha is read on the device and never shown. Only if that fails (e.g. another school's
  // portal draws it differently) or keeps being rejected do we fall back to asking the user.
  const showCaptcha = manualCaptcha || !!captchaQuery.error || (!!captchaQuery.data && !captchaQuery.data.code);

  const insets = useSafeAreaInsets();
  // Opening the app with an expired session: sign straight back in with the saved password (once).
  // After being logged out mid-use (another device signed in), wait for a tap instead, so the two
  // sessions don't keep kicking each other out.
  const autoTried = useRef(false);
  useEffect(() => {
    if (autoTried.current || !savedPassword || session.logoutNotice || !captchaQuery.data) return;
    autoTried.current = true;
    void submit(savedPassword);
  });

  const canSubmit = !!username.trim() && !!password && !submitting;
  // The app itself can't reach the portal (no internet, or sw not answering): signing in can't
  // work, so show only that and a retry instead of the form.
  // Only while the portal hasn't answered this screen: a failure left over from earlier (e.g. a
  // request cut off while the phone slept) mustn't hide a login form that loaded fine.
  const outage = useOutage('sw');
  const blocked = outage && !captchaQuery.isSuccess ? outage : null;

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 16 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={styles.header}>
          <SymbolView name={{ ios: 'building.columns.fill', android: 'account_balance' }} size={64} tintColor={systemColor('systemBlue')} />
          <Text style={styles.title}>管城市</Text>
          <Text style={styles.subtitle}>使用{session.schoolName}校務系統帳號登入</Text>
        </View>

        {session.logoutNotice ? (
          <View style={styles.notice}>
            <SymbolView name={{ ios: 'exclamationmark.circle.fill', android: 'error' }} size={18} tintColor={systemColor('systemOrange')} />
            <Text style={styles.noticeText}>
              {session.logoutNotice}
              {autofilled && password ? '密碼已自動填入，點「登入」即可。' : ''}
            </Text>
          </View>
        ) : null}

        {blocked ? (
          <Blocked
            title={blocked.title}
            message={blocked.message}
            offline={blocked.kind === 'offline'}
            retrying={captchaQuery.isFetching}
            onRetry={() => void captchaQuery.refetch()}
          />
        ) : (
          <>
            <PortalStatus outage={outage?.kind === 'offline' ? outage : null} />

            <View style={styles.form}>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="學號"
                placeholderTextColor={systemColor('placeholderText')}
                textContentType="username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => passwordRef.current?.focus()}
                clearButtonMode="while-editing"
              />
              <View style={styles.passwordRow}>
                <TextInput
                  ref={passwordRef}
                  // Remount once the saved password arrives: a secure field filled in from code may not
                  // draw its dots (seen in dark mode).
                  key={savedPassword ? 'saved' : 'typed'}
                  style={[styles.input, styles.passwordInput]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="密碼"
                  placeholderTextColor={systemColor('placeholderText')}
                  secureTextEntry={!showPassword}
                  textContentType="password"
                  autoComplete="current-password"
                  returnKeyType="go"
                  onSubmitEditing={() => void submit()}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? '隱藏密碼' : '顯示密碼'}
                  hitSlop={8}
                  onPress={() => setShowPassword((v) => !v)}
                  style={styles.eye}
                >
                  <SymbolView
                    name={showPassword ? { ios: 'eye.slash', android: 'visibility_off' } : { ios: 'eye', android: 'visibility' }}
                    size={20}
                    tintColor={systemColor('secondaryLabel')}
                  />
                </Pressable>
              </View>

              {showCaptcha ? (
                <View style={styles.captchaRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="換一張驗證碼"
                    onPress={() => captchaQuery.refetch()}
                    style={styles.captchaImage}
                  >
                    {image && !captchaQuery.isFetching ? (
                      <Image source={{ uri: image }} style={{ width: 120, height: 40 }} contentFit="contain" />
                    ) : (
                      <ActivityIndicator />
                    )}
                  </Pressable>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={captcha}
                    onChangeText={(text) => image && setCaptchaEdit({ image, text })}
                    placeholder="驗證碼"
                    placeholderTextColor={systemColor('placeholderText')}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={!canSubmit}
                onPress={() => void submit()}
                style={({ pressed }) => [styles.button, { opacity: !canSubmit ? 0.4 : pressed ? 0.8 : 1 }]}
              >
                {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>登入</Text>}
              </Pressable>

              <Text style={styles.note}>{showCaptcha ? '請輸入圖片中的數字，點圖片可換一張。' : '帳號密碼只會傳送給學校的伺服器'}</Text>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Blocked({
  title,
  message,
  offline,
  retrying,
  onRetry,
}: {
  title: string;
  message: string;
  offline: boolean;
  retrying: boolean;
  onRetry: () => void;
}) {
  const systems = useSystems();
  const bothDown = !offline && !!systems && isDownStatus(systems.sw) && isDownStatus(systems.siw);
  return (
    <View style={styles.blocked}>
      <SymbolView name={offline ? { ios: 'wifi.slash', android: 'wifi_off' } : { ios: 'exclamationmark.icloud', android: 'cloud_off' }} size={44} tintColor={systemColor('secondaryLabel')} />
      <Text style={styles.blockedTitle}>{bothDown ? '學校系統目前停止服務' : title}</Text>
      <Text style={styles.blockedMessage}>{bothDown ? '系統狀態顯示新、舊校務系統目前都無法連線，請稍後再試。' : message}</Text>
      {offline || !systems ? null : <SystemRows systems={systems} />}
      <Pressable
        accessibilityRole="button"
        disabled={retrying}
        onPress={onRetry}
        style={({ pressed }) => [styles.button, styles.retry, { opacity: retrying ? 0.6 : pressed ? 0.8 : 1 }]}
      >
        {retrying ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>重試</Text>}
      </Pressable>
      {offline ? null : (
        <Pressable accessibilityRole="link" onPress={() => router.push('/status')} hitSlop={8}>
          <Text style={styles.link}>查看系統狀態</Text>
        </Pressable>
      )}
    </View>
  );
}

function statusColor(status: MonitorStatus | undefined) {
  if (status === 'success') return systemColor('systemGreen');
  if (status === 'degraded' || status === 'maintenance') return systemColor('systemOrange');
  if (status === 'error') return systemColor('systemRed');
  return systemColor('systemGray');
}

/** One line per system: dot, name, state. */
function SystemRows({ systems }: { systems: ReturnType<typeof schoolSystemsStatus> }) {
  return (
    <View style={styles.systems}>
      {(['sw', 'siw'] as const).map((k) => (
        <View key={k} style={styles.systemRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor(systems[k]) }]} />
          <Text style={styles.systemName}>{SYSTEM_NAMES[k]}</Text>
          <Text style={[styles.systemState, { color: statusColor(systems[k]) }]}>{systems[k] ? statusLabel(systems[k]) : '未知'}</Text>
        </View>
      ))}
    </View>
  );
}

function PortalStatus({ outage }: { outage: Outage | null }) {
  const systems = useSystems();
  const uptime = useQuery({
    queryKey: ['uptime'],
    queryFn: getUptime,
    refetchInterval: 60_000,
  });
  const components = uptime.data?.groups.flatMap((g) => g.components) ?? [];
  const portal = components.find((c) => (c.description ?? '').trim() === 'sw.tpcu.edu.tw');
  const down = portal && (portal.status === 'error' || portal.status === 'maintenance');
  const troubled = !!systems && (systems.sw !== 'success' || systems.siw !== 'success');
  const open = () => router.push('/status');

  // What the app itself hit (no internet, sw not answering) takes precedence over the status page.
  const problem =
    outage ??
    (down
      ? {
          kind: 'down' as const,
          title: `新校務系統${portal.status === 'maintenance' ? '維護中' : '目前無法連線'}`,
          message: `系統狀態顯示新校務系統${statusLabel(portal.status)}，暫時無法登入。`,
        }
      : null);
  if (problem) {
    const offline = problem.kind === 'offline';
    return (
      <Pressable
        accessibilityRole="button"
        disabled={offline}
        onPress={open}
        style={({ pressed }) => [styles.notice, styles.down, { opacity: pressed ? 0.7 : 1 }]}
      >
        <SymbolView name={offline ? { ios: 'wifi.slash', android: 'wifi_off' } : { ios: 'exclamationmark.triangle.fill', android: 'warning' }} size={18} tintColor={systemColor('systemRed')} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.noticeText, { fontWeight: '600' }]}>{problem.title}</Text>
          <Text style={[styles.noticeText, { color: systemColor('secondaryLabel') }]}>
            {problem.message}
            {offline ? '' : ' 查看系統狀態 ›'}
          </Text>
        </View>
      </Pressable>
    );
  }
  if (!uptime.data) return null;
  return (
    <Pressable accessibilityRole="button" onPress={open} style={({ pressed }) => [styles.statusLine, { opacity: pressed ? 0.6 : 1 }]}>
      <View
        style={[
          styles.statusDot,
          {
            backgroundColor: systemColor(troubled ? 'systemOrange' : 'systemGreen'),
          },
        ]}
      />
      <Text style={styles.statusText}>
        {systems
          ? (['sw', 'siw'] as const).map((k) => `${SYSTEM_NAMES[k]}${systems[k] ? statusLabel(systems[k]) : '未知'}`).join(' · ')
          : '系統狀態'}
      </Text>
      <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} size={11} tintColor={systemColor('tertiaryLabel')} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  systems: {
    alignSelf: 'stretch',
    gap: 8,
    marginTop: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: systemColor('secondarySystemBackground'),
  },
  systemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  systemName: { flex: 1, fontSize: 15, color: systemColor('label') },
  systemState: { fontSize: 15, fontWeight: '600' },
  blocked: { alignItems: 'center', gap: 10, paddingTop: 8 },
  blockedTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: systemColor('label'),
    textAlign: 'center',
    marginTop: 6,
  },
  blockedMessage: {
    fontSize: 15,
    lineHeight: 21,
    color: systemColor('secondaryLabel'),
    textAlign: 'center',
  },
  retry: { alignSelf: 'stretch', marginTop: 18 },
  link: { fontSize: 15, color: systemColor('systemBlue'), marginTop: 8 },
  down: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: systemColor('systemRed'),
  },
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 20,
    paddingVertical: 6,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, color: systemColor('secondaryLabel') },
  root: { flex: 1, backgroundColor: systemColor('systemBackground') },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  header: { alignItems: 'center', gap: 10, marginBottom: 40 },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: systemColor('label'),
    marginTop: 8,
  },
  subtitle: {
    fontSize: 15,
    color: systemColor('secondaryLabel'),
    textAlign: 'center',
  },
  form: { gap: 12 },
  passwordRow: { justifyContent: 'center' },
  passwordInput: { paddingRight: 52 },
  eye: { position: 'absolute', right: 6, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  notice: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    marginBottom: 16,
    borderRadius: 14,
    backgroundColor: systemColor('secondarySystemBackground'),
  },
  noticeText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: systemColor('label'),
  },
  input: {
    height: 52,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 17,
    color: systemColor('label'),
    backgroundColor: systemColor('tertiarySystemFill'),
  },
  captchaRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  captchaImage: {
    width: 132,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: systemColor('tertiarySystemFill'),
  },
  button: {
    height: 52,
    borderRadius: 26,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: systemColor('systemBlue'),
  },
  buttonText: { color: 'white', fontSize: 17, fontWeight: '600' },
  note: {
    fontSize: 13,
    color: systemColor('secondaryLabel'),
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
});
