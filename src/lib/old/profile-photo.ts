import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import { USER_AGENT } from '@/lib/http';
import { legacyPost, onLegacyLogin } from '@/lib/old/client';
import { lastLegacyOrigin } from '@/lib/old/origin';

/**
 * The student's photo (入學照) from siw's 照片上傳 page (bg001). Kept on the phone so it shows
 * instantly and offline; its link changes per login, so it's looked up again after every siw
 * login and downloaded only when it points at a different file.
 */

const META_KEY = 'profilePhoto';
type Meta = { uid: string; src: string };

const file = () => new File(Paths.document, 'profile-photo.jpg');

let meta: Meta | null = null;
let version = 0;
let loaded: Promise<void> | null = null;
let refreshing: Promise<void> | null = null;
const listeners = new Set<() => void>();
const notify = () => {
  version++;
  listeners.forEach((l) => l());
};

function load() {
  loaded ??= SecureStore.getItemAsync(META_KEY)
    .then((raw) => {
      meta = raw ? (JSON.parse(raw) as Meta) : null;
      if (meta && !file().exists) meta = null;
      notify();
    })
    .catch(() => {});
  return loaded;
}

/** `<img src="../stdpics/<學號>_db_….jpg">` → absolute URL on the current host. */
async function photoUrl() {
  const html = await legacyPost('/tsint/bg_pro/bg001_02.jsp', [
    ['uploadfile', ''],
    ['photo_kind', '01'],
    ['todo', 'upload'],
    ['pic_type', ''],
  ]);
  const src = html.match(/<img[^>]*src="\.\.\/(stdpics\/[^"]+)"/i)?.[1];
  return src ? `${lastLegacyOrigin()}/tsint/${src}` : null;
}

const isImage = (b: Uint8Array) =>
  (b[0] === 0xff && b[1] === 0xd8) || // JPEG
  (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47); // PNG

async function refresh(uid: string) {
  await load();
  const url = await photoUrl();
  if (!url) return;
  // Same file as last time (the host can change; the file name is what identifies it).
  const src = url.slice(url.indexOf('/stdpics/'));
  if (meta?.uid === uid && meta.src === src && file().exists) return;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, credentials: 'include' });
  if (!res.ok) return;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!isImage(bytes)) return;
  const f = file();
  f.create({ overwrite: true });
  await f.write(bytes);
  meta = { uid, src };
  await SecureStore.setItemAsync(META_KEY, JSON.stringify(meta));
  notify();
}

onLegacyLogin((uid) => {
  refreshing ??= refresh(uid)
    .catch(() => {})
    .finally(() => {
      refreshing = null;
    });
});

/** On sign-out: forget the photo (the next student mustn't see it). */
export function clearProfilePhoto() {
  meta = null;
  try {
    if (file().exists) file().delete();
  } catch {
    // ignore
  }
  void SecureStore.deleteItemAsync(META_KEY).catch(() => {});
  notify();
}

/** The cached photo's file URI for student `uid`, or null when there's none yet. */
export function useProfilePhoto(uid: string | null | undefined) {
  const v = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      void load();
      return () => listeners.delete(l);
    },
    () => version,
  );
  if (!uid || meta?.uid !== uid) return null;
  return `${file().uri}?v=${v}`;
}
