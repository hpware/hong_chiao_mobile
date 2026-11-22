import { useNativeState } from '@expo/ui';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { HeroRow, PrimaryButtonRow, Screen, Section, TextFieldRow, ValueRow } from '@/components/native';
import { getLegacyStudentId, LegacyPasswordError, signInLegacy } from '@/lib/old/client';
import { useSession } from '@/providers/session';

/**
 * Asks once for the legacy system's (siw) password when it differs from the portal's. siw
 * checks it right away; an accepted password is saved in the Keychain so this never comes up again.
 */
export default function LegacyPasswordScreen() {
  const session = useSession();
  const queryClient = useQueryClient();
  const uid = getLegacyStudentId() || session.studentId;
  const passwordState = useNativeState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!password) return;
    setSubmitting(true);
    try {
      await signInLegacy({ uid, pwd: password });
      await queryClient.invalidateQueries({ queryKey: ['legacy'] });
      if (router.canGoBack()) router.back();
    } catch (e) {
      Alert.alert(
        e instanceof LegacyPasswordError ? '密碼錯誤' : '無法連線到舊系統',
        e instanceof LegacyPasswordError ? '舊系統不接受這組密碼，請再試一次。' : e instanceof Error ? e.message : String(e),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => router.back()}>稍後</Stack.Toolbar.Button>
      </Stack.Toolbar>

      <Section>
        <HeroRow
          icon="key.fill"
          title="舊系統密碼"
          subtitle={'只需輸入一次，密碼會安全地存在這支 iPhone。'}
        />
      </Section>

      <Section footer="課表、成績、缺曠、請假與獎懲都來自舊系統。">
        <ValueRow label="學號" value={uid} />
        <TextFieldRow
          state={passwordState}
          onChangeText={setPassword}
          label="密碼"
          placeholder="舊系統密碼"
          secure
          contentType="password"
          submitLabel="go"
          onSubmit={submit}
        />
      </Section>

      <Section>
        <PrimaryButtonRow title="登入舊系統" onPress={submit} loading={submitting} disabled={!password} />
      </Section>
    </Screen>
  );
}
