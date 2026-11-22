import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Alert } from 'react-native';


import { openInApp } from '@/lib/browser';
import { useProfilePhoto } from '@/lib/old/profile-photo';
import { ActionRow, NavRow, PickerRow, ProfileRow, Screen, Section, ValueRow } from '@/components/native';
import { getUserName } from '@/lib/api/auth';
import { getUptime, SCHOOL_SITE } from '@/lib/api/school-site';
import { useEnrollment } from '@/lib/enrollment';
import { getSchedule, getScheduleSemesters } from '@/lib/old/api';
import { getWidgetDiagnostics, syncScheduleWidget } from '@/widgets/sync-schedule-widget';
import { formatSemester } from '@/lib/semester';
import { useSession } from '@/providers/session';
import { useThemePreference, type ThemePreference } from '@/providers/theme';

const themeOptions: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: '跟隨系統' },
  { value: 'light', label: '淺色' },
  { value: 'dark', label: '深色' },
];

export default function SettingsScreen() {
  const session = useSession();
  const { preference, setPreference } = useThemePreference();
  const name = useQuery({ queryKey: ['user', 'name'], queryFn: getUserName, staleTime: Infinity });
  const enrollment = useEnrollment();
  const uptime = useQuery({ queryKey: ['uptime'], queryFn: getUptime, refetchInterval: 5 * 60_000 });
  const widget = useQuery({ queryKey: ['widget', 'diagnostics'], queryFn: getWidgetDiagnostics, staleTime: 0 });
  const refreshWidget = async () => {
    try {
      const semesters = await getScheduleSemesters();
      const yms = (semesters.find((s) => s.selected) ?? semesters[0])?.value;
      if (yms) await syncScheduleWidget(await getSchedule(yms));
    } catch (e) {
      Alert.alert('無法更新小工具', e instanceof Error ? e.message : String(e));
    }
    await widget.refetch();
  };
  const down = uptime.data?.groups.flatMap((g) => g.components).filter((c) => c.status !== 'success').length;

  const photo = useProfilePhoto(session.studentId);

  const confirmLogout = () =>
    Alert.alert('登出', '確定要登出嗎？', [
      { text: '取消', style: 'cancel' },
      { text: '登出', style: 'destructive', onPress: () => void session.signOut() },
    ]);

  return (
    <Screen>
      <Section>
        <ProfileRow
          name={name.data || '使用者'}
          photo={photo}
          subtitle={[session.schoolName, session.studentId].filter(Boolean).join(' · ')}
        />
      </Section>

      <Section title="學籍" footer="入學學期取自新校務系統（sw）的歷年學期紀錄。">
        <ValueRow
          label="入學"
          value={enrollment.first ? formatSemester(enrollment.first.year, enrollment.first.semi) : enrollment.query.isError ? '無法取得' : '載入中…'}
          icon="graduationcap"
        />
        <ValueRow label="在學學期" value={enrollment.count ? `${enrollment.count} 個學期` : undefined} icon="calendar" />
      </Section>

      <Section title="學校">
        <NavRow
          title="系統狀態"
          icon="waveform.path.ecg"
          detail={down === undefined ? undefined : down === 0 ? '全部正常' : `${down} 個異常`}
          onPress={() => router.push('/status')}
        />
        <NavRow title="學校網站" icon="safari" external onPress={() => openInApp(SCHOOL_SITE)} />
      </Section>

      {widget.data ? (
        <Section
          title="小工具"
          footer={
            widget.data.containerOk
              ? '小工具和 App 共用同一個資料夾。若小工具仍顯示「打開管城市」，請移除後重新加入。'
              : '小工具讀不到 App 的資料：這個版本的簽署沒有可用的 App Group（側載工具可能沒有轉換）。'
          }>
          <ValueRow label="共用資料夾" value={widget.data.containerOk ? '可用' : '無法存取'} tone={widget.data.containerOk ? 'success' : 'destructive'} icon="square.stack.3d.up" />
          <ValueRow label="App Group" value={widget.data.group ?? '—'} />
          <ValueRow label="課表資料" value={`${widget.data.entries} 筆`} />
          {widget.data.error ? <ValueRow label="錯誤" value={widget.data.error} tone="destructive" /> : null}
          <ActionRow title="立即更新小工具" icon="arrow.clockwise" onPress={() => void refreshWidget()} />
        </Section>
      ) : null}

      <Section>
        <PickerRow
          label="外觀"
          icon="circle.lefthalf.filled"
          selection={preference}
          options={themeOptions}
          onChange={setPreference}
        />
      </Section>

      <Section>
        <NavRow title="變更密碼" icon="key" onPress={() => router.push('/change-password')} />
        <NavRow title="舊系統密碼" subtitle="siw 密碼和新系統不同時使用" icon="key.horizontal" onPress={() => router.push('/legacy-password')} />
        <NavRow title="關於此 App" icon="info.circle" onPress={() => router.push('/about')} />
      </Section>

      <Section>
        <ActionRow title="登出" destructive onPress={confirmLogout} />
      </Section>
    </Screen>
  );
}
