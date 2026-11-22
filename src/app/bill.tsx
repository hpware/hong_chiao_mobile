import { useLocalSearchParams } from 'expo-router';

import { DocumentViewer } from '@/components/document-viewer';
import { Status } from '@/components/native';
import { downloadBillPdf } from '@/lib/api/downloads';
import { getBillFile, type Term } from '@/lib/api/tuition';

/** Ports `/tuition/bill` and `/tuition/bill-balance`. */
export default function BillScreen() {
  const params = useLocalSearchParams<{ kind?: string; year?: string; semester?: string }>();
  const kind = params.kind === 'balance' ? 'balance' : 'bill';
  const title = kind === 'balance' ? '補繳費單' : '繳費單';

  const hasTerm = params.year !== undefined || params.semester !== undefined;
  const year = Number(params.year);
  const semester = Number(params.semester);
  const term: Term | undefined =
    Number.isSafeInteger(year) && year > 0 && (semester === 1 || semester === 2)
      ? { year, semester }
      : undefined;

  if (hasTerm && !term) {
    return (
      <Status title="無法辨識學年度或學期" />
    );
  }

  return (
    <DocumentViewer
      title={title}
      queryKey={['bill', kind, term?.year ?? null, term?.semester ?? null]}
      load={async () => {
        const file = await getBillFile(kind, term);
        return downloadBillPdf('TuitionBill', file.id, file.name);
      }}
    />
  );
}
