import { useNativeState } from '@expo/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import {
  ActionRow,
  Loading,
  NavRow,
  Screen,
  Section,
  Status,
  TextFieldRow,
  TextRow,
  ValueRow,
} from '@/components/native';
import {
  getApplication,
  getScholarship,
  isEditable,
  saveApplication,
  sendApplication,
  uploadScholarshipFile,
  type UploadedFile,
} from '@/lib/api/scholarship';
import { openInApp } from '@/lib/browser';
import { SessionExpiredError } from '@/lib/http';
import { pickAttachment } from '@/lib/pick-file';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Ports `/credit-application/apply/[id]`, plus uploading and submitting (which the web app lacked). */
export default function ScholarshipDetailScreen() {
  const { id, url } = useLocalSearchParams<{ id: string; url?: string }>();
  const detail = useQuery({ queryKey: ['scholarship', id], queryFn: () => getScholarship(id), retry: false });
  const application = useQuery({ queryKey: ['scholarship', id, 'application'], queryFn: () => getApplication(id) });

  // Local edits over what the portal has saved.
  const descriptionState = useNativeState('');
  const [descriptionEdit, setDescriptionEdit] = useState<string | null>(null);
  const [fileEdits, setFileEdits] = useState<Record<string, UploadedFile | null>>({});
  const [uploading, setUploading] = useState<string | null>(null);

  const saved = application.data;
  useEffect(() => {
    if (saved) descriptionState.set(saved.descript);
  }, [saved, descriptionState]);

  const description = descriptionEdit ?? saved?.descript ?? '';
  const files: Record<string, UploadedFile> = { ...saved?.files };
  for (const [code, f] of Object.entries(fileEdits)) {
    if (f) files[code] = f;
    else delete files[code];
  }
  const dirty = descriptionEdit !== null || Object.keys(fileEdits).length > 0;

  const save = useMutation({
    mutationFn: async (send: boolean) => {
      const objid = await saveApplication({
        id,
        objid: saved?.objid,
        descript: description,
        documents: detail.data?.DocList ?? [],
        files,
      });
      if (send) await sendApplication(objid);
    },
  });

  if (detail.error && !(detail.error instanceof SessionExpiredError)) {
    return (
      <Status
        title="找不到這個獎學金"
        icon="magnifyingglass"
        message={detail.error.message || '此項目不存在或已下架。'}
        actionTitle="重試"
        onAction={() => detail.refetch()}
      />
    );
  }
  const scholarship = detail.data;
  if (!scholarship) return <Loading />;

  const documents = scholarship.DocList ?? [];
  const infoUrl = scholarship.URL || url;
  const editable = isEditable(saved?.status);
  const missing = documents.filter((d) => d.Choose === '必備' && !files[d.Code]);

  const pickAndUpload = async (code: string) => {
    let file;
    try {
      file = await pickAttachment('上傳文件');
    } catch (e) {
      Alert.alert('無法讀取檔案', errorText(e));
      return;
    }
    if (!file) return;
    setUploading(code);
    try {
      const uploaded = await uploadScholarshipFile(file);
      setFileEdits((cur) => ({ ...cur, [code]: uploaded }));
    } catch (e) {
      Alert.alert('上傳失敗', errorText(e));
    } finally {
      setUploading(null);
    }
  };

  const run = async (send: boolean) => {
    try {
      await save.mutateAsync(send);
      setDescriptionEdit(null);
      setFileEdits({});
      await application.refetch();
      Alert.alert(send ? '已送出申請' : '已儲存', send ? '承辦單位審核後，狀態會更新在這裡。' : '草稿已存到校務系統，之後可以繼續編輯。');
    } catch (e) {
      Alert.alert(send ? '無法送出' : '無法儲存', errorText(e));
    }
  };

  const confirmSend = () => {
    if (missing.length > 0) {
      Alert.alert('還缺必備文件', missing.map((d) => `${d.No}. ${d.Code}`).join('\n'));
      return;
    }
    Alert.alert('送出申請？', '送出後就無法再修改，除非承辦單位退回補件。', [
      { text: '取消', style: 'cancel' },
      { text: '送出', onPress: () => void run(true) },
    ]);
  };

  return (
    <Screen onRefresh={() => Promise.all([detail.refetch(), application.refetch()])}>
      <Section>
        <TextRow title={scholarship.Title} />
      </Section>

      <Section title="我的申請" footer={saved?.reason ? `退回原因：${saved.reason}` : undefined}>
        {application.isPending ? (
          <TextRow body="讀取申請狀態…" tone="secondary" />
        ) : application.error ? (
          <ActionRow title={`無法讀取申請狀態：${errorText(application.error)}（點此重試）`} onPress={() => application.refetch()} />
        ) : (
          <ValueRow
            label="狀態"
            icon="doc.badge.clock"
            value={saved ? saved.statusText || '草稿' : '尚未申請'}
            tone={!saved ? 'secondary' : saved.status === '0' ? 'secondary' : editable ? 'destructive' : 'success'}
          />
        )}
      </Section>

      <Section title="承辦">
        <ValueRow label="承辦人" value={scholarship.UnPerText} icon="person" />
        <ValueRow label="單位" value={scholarship.UnOrgText} icon="building.2" />
        <ValueRow label="申請期間" value={`${scholarship.StartDate} – ${scholarship.EndDate}`} icon="calendar" />
        <ValueRow
          label="上傳期限"
          value={scholarship.UpLoadDate === '999/12/31' ? scholarship.EndDate : scholarship.UpLoadDate}
          icon="arrow.up.doc"
        />
        {infoUrl ? (
          <NavRow title="學校公告" icon="safari" external onPress={() => openInApp(infoUrl)} />
        ) : null}
      </Section>

      {documents.map((doc) => {
        const template = doc.FileTitle.trim();
        const uploaded = files[doc.Code];
        return (
          <Section key={doc.No} title={`${doc.No}. ${doc.Code}（${doc.Choose}）`}>
            {template ? (
              <NavRow
                title="下載範本"
                subtitle={doc.ShowFileName.trim() || template}
                icon="doc.text"
                onPress={() =>
                  router.push({
                    pathname: '/scholarship/document',
                    params: { fileTitle: template, fileName: doc.ShowFileName.trim() || template, label: doc.Code },
                  })
                }
              />
            ) : null}
            {uploaded ? <ValueRow label="已上傳" subtitle={uploaded.showName} icon="checkmark.circle.fill" tone="success" value="" /> : null}
            {editable ? (
              <ActionRow
                title={uploaded ? '重新上傳' : '上傳檔案'}
                icon="arrow.up.doc"
                loading={uploading === doc.Code}
                disabled={uploading !== null}
                onPress={() => void pickAndUpload(doc.Code)}
              />
            ) : null}
            {editable && uploaded ? (
              <ActionRow title="移除檔案" destructive onPress={() => setFileEdits((cur) => ({ ...cur, [doc.Code]: null }))} />
            ) : null}
          </Section>
        );
      })}

      {scholarship.Memo ? (
        <Section title="備註">
          <TextRow body={scholarship.Memo} />
        </Section>
      ) : null}

      <Section title="申請說明" footer={`${description.length}/4000`}>
        <TextFieldRow
          state={descriptionState}
          onChangeText={setDescriptionEdit}
          placeholder="請填寫申請原因或補充說明"
          multiline
          autoCapitalize
          maxLength={4000}
        />
      </Section>

      {editable ? (
        <Section
          footer={
            missing.length > 0
              ? `還缺 ${missing.length} 項必備文件。檔案上限 3 MB，可用 PDF 或圖片。`
              : '儲存會存成草稿；送出後由承辦單位審核。'
          }>
          <ActionRow
            title="儲存草稿"
            icon="square.and.arrow.down"
            loading={save.isPending && save.variables === false}
            disabled={save.isPending || uploading !== null || (!dirty && !!saved)}
            onPress={() => void run(false)}
          />
          <ActionRow
            title="送出申請"
            icon="paperplane"
            loading={save.isPending && save.variables === true}
            disabled={save.isPending || uploading !== null}
            onPress={confirmSend}
          />
        </Section>
      ) : null}
    </Screen>
  );
}
