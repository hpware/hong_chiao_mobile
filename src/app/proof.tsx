import { useLocalSearchParams } from 'expo-router';

import { DocumentViewer } from '@/components/document-viewer';
import { Status } from '@/components/native';
import { downloadBillPdf } from '@/lib/api/downloads';

/** Ports `/tuition/proof-of-payment/[id]`. */
export default function ProofScreen() {
  const { id, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  if (!id) {
    return (
      <Status title="缺少繳費證明 ID" />
    );
  }
  const fileName = name || '繳費證明.pdf';
  return (
    <DocumentViewer
      title="繳費證明"
      queryKey={['proof', id]}
      load={() => downloadBillPdf('Temp', id, fileName)}
    />
  );
}
