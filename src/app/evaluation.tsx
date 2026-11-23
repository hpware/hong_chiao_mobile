import { useNativeState } from '@expo/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { ActionRow, Loading, ScaleRow, Screen, Section, Status, TextFieldRow, TextRow } from '@/components/native';
import { getEvaluationForm, submitEvaluation, surveyTextLength } from '@/lib/old/api';
import type { EvaluationForm, EvaluationQuestion } from '@/lib/old/parsers';
import { fitsSegments } from '@/lib/scale';

const TEXT_LIMIT = 250;

/** One course's 教學評量 form. */
export default function EvaluationScreen() {
  const { arg, name } = useLocalSearchParams<{ arg: string; name?: string }>();
  const form = useQuery({ queryKey: ['legacy', 'evaluation', arg], queryFn: () => getEvaluationForm(arg), gcTime: 0 });

  const title = <Stack.Screen options={{ title: name || '教學評量' }} />;
  if (form.isPending) return <>{title}<Loading text="正在讀取評量…" /></>;
  if (form.error) {
    const unsupported = form.error.message.startsWith('unsupported');
    return (
      <>
        {title}
        {unsupported ? (
          <Status
            title="這份評量有新題型"
            message="請在舊系統網頁填寫。"
            actionTitle="開啟網頁版"
            onAction={() => router.replace({ pathname: '/legacy-web', params: { fncid: 'BG052', title: '教學評量' } })}
          />
        ) : (
          <Status title="無法載入評量" message={form.error.message} actionTitle="重試" onAction={() => form.refetch()} />
        )}
      </>
    );
  }
  return <>{title}<EvaluationFormView form={form.data} /></>;
}

function EvaluationFormView({ form }: { form: EvaluationForm }) {
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const set = (no: string, value: string) => setAnswers((a) => ({ ...a, [no]: value }));
  const submit = useMutation({ mutationFn: () => submitEvaluation(form, answers) });

  const questions = form.parts.flatMap((p) => p.questions);
  const missing = questions.filter((q) => q.required && !answers[q.no]?.trim()).length;
  const tooLong = questions.some((q) => q.kind === 'text' && surveyTextLength(answers[q.no] ?? '') > TEXT_LIMIT);

  const confirmAndSubmit = () =>
    Alert.alert('送出評量？', `${form.course} · ${form.teacher}\n送出後就不能再修改。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '送出',
        onPress: async () => {
          try {
            const result = await submit.mutateAsync();
            await queryClient.invalidateQueries({ queryKey: ['legacy', 'evaluations'] });
            if (!result.success) {
              Alert.alert('學校系統沒有收下評量', result.message || '請回到課程列表確認。');
              return;
            }
            Alert.alert('評量已送出', result.message, [{ text: '好', onPress: () => router.back() }]);
          } catch (e) {
            Alert.alert('無法送出', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);

  return (
    <Screen>
      <Section>
        <TextRow title={form.course} meta={`任課教師 ${form.teacher}`} />
      </Section>
      {form.parts.map((part) => (
        <Section key={part.title} title={part.title.replace(/^第.部[份分][：:]/, '')}>
          {part.questions.map((q) => (
            <Question key={q.no} question={q} value={answers[q.no] ?? ''} onChange={(v) => set(q.no, v)} />
          ))}
        </Section>
      ))}
      <Section footer={missing ? `還有 ${missing} 題沒有回答。` : '送出後就不能再修改。'}>
        <ActionRow title="送出評量" icon="paperplane" onPress={confirmAndSubmit} loading={submit.isPending} disabled={missing > 0 || tooLong} />
      </Section>
    </Screen>
  );
}

function Question({ question: q, value, onChange }: { question: EvaluationQuestion; value: string; onChange: (v: string) => void }) {
  const state = useNativeState('');
  if (q.kind === 'choice') {
    const labels = q.options.map((o) => o.label);
    const segmented = fitsSegments(labels);
    return (
      <ScaleRow
        title={q.text}
        selection={value}
        options={q.options.map((o) => ({ label: o.label, value: o.value }))}
        onChange={onChange}
        menu={!segmented}
      />
    );
  }
  const over = surveyTextLength(value) > TEXT_LIMIT;
  return (
    <>
      <TextRow body={`${q.text}${q.required ? '' : '（選填）'}`} />
      <TextFieldRow state={state} onChangeText={onChange} placeholder="中文 125 字，英文 250 字以內" multiline />
      {over ? <TextRow body="超過字數限制（中文 125 字，英文 250 字）。" tone="destructive" /> : null}
    </>
  );
}
