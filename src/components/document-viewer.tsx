import { useQuery } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Stack } from 'expo-router';
import { Alert, Platform, useColorScheme } from 'react-native';
import { WebView } from 'react-native-webview';

import { Loading, Status } from '@/components/native';
import { isPdfName } from '@/lib/api/downloads';

export type LoadedDocument = { uri: string; name: string };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Android's WebView can't render PDFs, so on Android we load pdf.js (same
 * engine the web app's `pdfjs-viewer-element` uses) and feed it the bytes.
 */
function pdfJsHtml(base64: string, dark: boolean) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=4">
<style>body{margin:0;background:${dark ? '#000' : '#f2f2f7'}}canvas{display:block;width:100%;height:auto;margin:0 0 8px;background:#fff}#e{color:#ff3b30;font:15px -apple-system,sans-serif;padding:16px}</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script></head>
<body><div id="e"></div><script>
(async function(){try{
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
var raw=atob('${base64}');var bytes=new Uint8Array(raw.length);for(var i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
var pdf=await pdfjsLib.getDocument({data:bytes}).promise;
for(var p=1;p<=pdf.numPages;p++){var page=await pdf.getPage(p);var vp=page.getViewport({scale:2});
var c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;document.body.appendChild(c);
await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;}
}catch(err){document.getElementById('e').textContent='無法預覽 PDF：'+err.message;}})();
</script></body></html>`;
}

function PdfView({ doc }: { doc: LoadedDocument }) {
  const dark = useColorScheme() === 'dark';
  const base64 = useQuery({
    queryKey: ['pdf-base64', doc.uri],
    queryFn: () => new File(doc.uri).base64(),
    enabled: Platform.OS === 'android',
    staleTime: Infinity,
  });

  if (Platform.OS === 'ios') {
    // WKWebView renders PDFs natively (PDFKit), with pinch-zoom and text selection.
    return (
      <WebView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        source={{ uri: doc.uri }}
        originWhitelist={['*']}
        allowFileAccess
        allowingReadAccessToURL={doc.uri}
        contentInsetAdjustmentBehavior="automatic"
      />
    );
  }
  if (base64.isPending) return <Loading text="正在準備預覽…" />;
  if (base64.error) return <Status title="無法預覽" message={errorText(base64.error)} />;
  return (
    <WebView
      style={{ flex: 1, backgroundColor: 'transparent' }}
      originWhitelist={['*']}
      source={{ html: pdfJsHtml(base64.data, dark), baseUrl: 'https://localhost/' }}
    />
  );
}

/** Downloads a portal document and previews it (PDF) or offers it to the share sheet. */
export function DocumentViewer({
  title,
  queryKey,
  load,
}: {
  title: string;
  queryKey: readonly unknown[];
  load: () => Promise<LoadedDocument>;
}) {
  const doc = useQuery({ queryKey, queryFn: load, staleTime: 30 * 60 * 1000, gcTime: 30 * 60 * 1000 });

  const share = async () => {
    if (!doc.data) return;
    try {
      await Sharing.shareAsync(doc.data.uri, {
        dialogTitle: doc.data.name,
        mimeType: isPdfName(doc.data.name) ? 'application/pdf' : undefined,
        UTI: isPdfName(doc.data.name) ? 'com.adobe.pdf' : undefined,
      });
    } catch (e) {
      Alert.alert('無法分享檔案', errorText(e));
    }
  };

  return (
    <>
      <Stack.Screen options={{ title }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="square.and.arrow.up"
          accessibilityLabel="分享或儲存"
          disabled={!doc.data}
          onPress={share}
        />
      </Stack.Toolbar>
      {doc.isPending ? (
        <Loading text={`正在取得${title}…`} />
      ) : doc.error ? (
        <Status title={`無法取得${title}`} message={errorText(doc.error)} actionTitle="重試" onAction={() => doc.refetch()} />
      ) : isPdfName(doc.data.name) ? (
        <PdfView doc={doc.data} />
      ) : (
        <Status
          title={doc.data.name}
          icon="doc"
          message="這個檔案類型無法在 App 內預覽。"
          actionTitle="分享或開啟"
          onAction={share}
        />
      )}
    </>
  );
}
