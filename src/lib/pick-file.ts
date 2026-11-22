import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { ActionSheetIOS, Alert, Platform } from 'react-native';

import type { PickedFile } from '@/lib/multipart';

type Source = 'camera' | 'photos' | 'files';

const SOURCES: { source: Source; label: string }[] = [
  { source: 'camera', label: '拍照' },
  { source: 'photos', label: '從照片選擇' },
  { source: 'files', label: '選擇檔案（PDF 或圖片）' },
];

/** Longest side of uploaded photos: plenty for a doctor's note or form, and well under 3 MB as JPEG. */
const MAX_SIDE = 2000;

function chooseSource(title: string): Promise<Source | null> {
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title, options: [...SOURCES.map((s) => s.label), '取消'], cancelButtonIndex: SOURCES.length },
        (i) => resolve(SOURCES[i]?.source ?? null),
      );
      return;
    }
    Alert.alert(title, undefined, [
      ...SOURCES.map((s) => ({ text: s.label, onPress: () => resolve(s.source) })),
      { text: '取消', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}

/** Photos (often HEIC and 12 MP) become a resized JPEG the school's servers accept. */
async function photoToJpeg(asset: ImagePicker.ImagePickerAsset): Promise<PickedFile> {
  const context = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > MAX_SIDE) {
    context.resize(asset.width >= asset.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const image = await (await context.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  const base = (asset.fileName ?? 'photo').replace(/\.[^.]+$/, '');
  return { name: `${base}.jpg`, contentType: 'image/jpeg', bytes: await new File(image.uri).bytes() };
}

async function fromCamera() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('無法使用相機', '請到「設定」允許管城市使用相機。');
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  return result.canceled ? null : photoToJpeg(result.assets[0]);
}

async function fromPhotos() {
  // The iOS photo picker runs out of process, so it needs no library permission.
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  return result.canceled ? null : photoToJpeg(result.assets[0]);
}

async function fromFiles(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/jpeg', 'image/png'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  return {
    name: asset.name,
    contentType: asset.mimeType ?? 'application/octet-stream',
    bytes: await new File(asset.uri).bytes(),
  };
}

/**
 * Asks where the attachment comes from (camera, photo library or Files), then returns it ready
 * to upload. Resolves to `null` if the user cancels.
 */
export async function pickAttachment(title = '附加文件'): Promise<PickedFile | null> {
  const source = await chooseSource(title);
  if (source === 'camera') return fromCamera();
  if (source === 'photos') return fromPhotos();
  if (source === 'files') return fromFiles();
  return null;
}
