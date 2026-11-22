import { useNativeState } from '@expo/ui';
import { useMutation } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { HeroRow, PrimaryButtonRow, Screen, Section, TextFieldRow, ValueRow } from '@/components/native';
import { changePassword, passwordRule, passwordRuleMessage } from '@/lib/api/auth';
import { useSession } from '@/providers/session';

/** Ports the web settings page's 變更密碼 card. */
export default function ChangePasswordScreen() {
  const session = useSession();
  const newState = useNativeState('');
  const confirmState = useNativeState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const mutation = useMutation({ mutationFn: changePassword });

  const submit = async () => {
    if (!passwordRule.test(newPassword)) {
      Alert.alert('密碼格式不符', passwordRuleMessage);
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('密碼不一致', '兩次輸入的新密碼不一樣。');
      return;
    }
    try {
      await mutation.mutateAsync(newPassword);
    } catch (e) {
      Alert.alert('無法變更密碼', e instanceof Error ? e.message : String(e));
      return;
    }
    // The portal ends the session after a password change.
    Alert.alert('密碼已更新', '請使用新密碼重新登入。', [
      { text: '好', onPress: () => void session.signOut({ expired: true }) },
    ]);
  };

  return (
    <Screen>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => router.back()}>取消</Stack.Toolbar.Button>
      </Stack.Toolbar>

      <Section>
        <HeroRow icon="key.fill" title="變更密碼" subtitle={'變更校務系統（sw）的登入密碼。\n變更後需要用新密碼重新登入。'} />
      </Section>

      <Section footer="需包含 8~20 位英文大小寫與數字，只能使用 &!@#$%^*()+=_~ 這些符號，且不可與前三次的密碼相同。">
        <ValueRow label="學號" value={session.studentId} />
        <TextFieldRow
          state={newState}
          onChangeText={setNewPassword}
          label="新密碼"
          placeholder="8~20 位"
          secure
          contentType="newPassword"
          submitLabel="next"
        />
        <TextFieldRow
          state={confirmState}
          onChangeText={setConfirmPassword}
          label="確認密碼"
          placeholder="再輸入一次"
          secure
          contentType="newPassword"
          submitLabel="done"
          onSubmit={submit}
        />
      </Section>

      <Section>
        <PrimaryButtonRow
          title="變更密碼"
          onPress={submit}
          loading={mutation.isPending}
          disabled={!newPassword || !confirmPassword}
        />
      </Section>
    </Screen>
  );
}
