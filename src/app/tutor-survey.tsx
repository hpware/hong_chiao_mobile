import { useNativeState } from '@expo/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { ActionRow, Loading, ScaleRow, Screen, Section, Status, TextFieldRow, TextRow } from '@/components/native';
import { getTutorSurvey, submitTutorSurvey, surveyTextLength } from '@/lib/old/api';
import type { SurveyQuestion } from '@/lib/old/parsers';

const TEXT_LIMIT = 250;

/** Five equal segments can't fit 非常不同意; 很 says the same in one character less. */
const short = (label: string) => label.replace(/^非常/, '很');

const openOnWeb = () =>
  router.replace({ pathname: '/legacy-web', params: { fncid: 'BK054', title: '導師輔導服務滿意度調查' } });

/** 導師輔導服務滿意度調查 (BK054): one tap per question, then a single final submit. */
export default function TutorSurveyScreen() {
  const survey = useQuery({ queryKey: ['legacy', 'tutor-survey'], queryFn: getTutorSurvey, gcTime: 0 });

  if (survey.isPending) return <Loading text="正在讀取問卷…" />;
  if (survey.error) {
    const unsupported = survey.error.message.startsWith('unsupported');
    return unsupported ? (
      <Status title="這份問卷有新題型" message="請在舊系統網頁填寫。" actionTitle="開啟網頁版" onAction={openOnWeb} />
    ) : (
      <Status title="無法載入問卷" message={survey.error.message} actionTitle="重試" onAction={() => survey.refetch()} />
    );
  }
  if (!survey.data.open) {
    const done = survey.data.message.includes('填寫完成');
    return done ? (
      <Status title="已填寫完成" icon="checkmark.circle" message="這學期的導師輔導服務滿意度調查已經送出了。" />
    ) : (
      <Status title="目前沒有要填的問卷" icon="checkmark.circle" message={survey.data.message || undefined} />
    );
  }
  return <SurveyForm title={survey.data.title} teacher={survey.data.teacher} questions={survey.data.questions} />;
}

function SurveyForm({ title, teacher, questions }: { title: string; teacher: string; questions: SurveyQuestion[] }) {
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const set = (no: string, value: string) => setAnswers((a) => ({ ...a, [no]: value }));
  const submit = useMutation({ mutationFn: () => submitTutorSurvey(questions, answers) });

  const choices = questions.filter((q) => q.kind === 'choice');
  const texts = questions.filter((q) => q.kind === 'text');
  const missing = questions.filter((q) => (q.kind === 'choice' || q.required) && !answers[q.no]?.trim());
  const tooLong = questions.some((q) => q.kind === 'text' && surveyTextLength(answers[q.no] ?? '') > TEXT_LIMIT);

  const confirmAndSubmit = () =>
    Alert.alert('送出問卷？', '送出後就不能再修改。', [
      { text: '取消', style: 'cancel' },
      {
        text: '送出',
        onPress: async () => {
          try {
            const result = await submit.mutateAsync();
            if (result.success === false) {
              Alert.alert('學校系統沒有收下問卷', result.message);
              return;
            }
            await queryClient.invalidateQueries({ queryKey: ['legacy', 'tutor-survey'] });
            Alert.alert('問卷已送出', result.message || '謝謝你的回饋。', [{ text: '好', onPress: () => router.back() }]);
          } catch (e) {
            Alert.alert('無法送出', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);

  return (
    <Screen>
      <Section>
        <TextRow title={title} meta={teacher ? `導師 ${teacher}` : undefined} />
      </Section>
      <Section>
        {choices.map((q) => (
          <ScaleRow
            key={q.no}
            title={`${q.no}. ${q.text}`}
            selection={answers[q.no] ?? ''}
            options={q.choices.map((c) => ({ label: short(c.label), value: c.code }))}
            onChange={(v) => set(q.no, v)}
          />
        ))}
      </Section>
      {texts.map((q) => (
        <TextQuestion key={q.no} question={q} value={answers[q.no] ?? ''} onChange={(v) => set(q.no, v)} />
      ))}
      <Section footer={missing.length ? `還有 ${missing.length} 題沒有回答。` : '送出後就不能再修改。'}>
        <ActionRow
          title="送出問卷"
          icon="paperplane"
          onPress={confirmAndSubmit}
          loading={submit.isPending}
          disabled={missing.length > 0 || tooLong}
        />
      </Section>
    </Screen>
  );
}

function TextQuestion({ question, value, onChange }: { question: Extract<SurveyQuestion, { kind: 'text' }>; value: string; onChange: (v: string) => void }) {
  const state = useNativeState('');
  const used = surveyTextLength(value);
  return (
    <Section
      title={`${question.no}. ${question.text}${question.required ? '' : '（選填）'}`}
      footer={used > TEXT_LIMIT ? `超過字數限制（中文 125 字，英文 250 字）。` : `中文 125 字，英文 250 字以內。`}>
      <TextFieldRow state={state} onChangeText={onChange} placeholder={question.text} multiline autoCapitalize />
    </Section>
  );
}
