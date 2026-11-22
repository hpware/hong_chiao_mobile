import { useLocalSearchParams } from 'expo-router';

import { DocumentViewer } from '@/components/document-viewer';
import { Status } from '@/components/native';
import { downloadScholarshipDocument } from '@/lib/api/downloads';

/** Ports `/api/downloads/credit-application/[id]` as an in-app viewer. */
export default function ScholarshipDocumentScreen() {
  const { fileTitle, fileName, label } = useLocalSearchParams<{
    fileTitle?: string;
    fileName?: string;
    label?: string;
  }>();
  if (!fileTitle) {
    return (
      <Status title="下載參數無效。" />
    );
  }
  return (
    <DocumentViewer
      title={label || '申請文件'}
      queryKey={['scholarship-document', fileTitle]}
      load={() => downloadScholarshipDocument(fileTitle, fileName || fileTitle)}
    />
  );
}
