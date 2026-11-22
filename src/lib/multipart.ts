export type MultipartPart =
  | { name: string; value: string }
  | { name: string; filename: string; contentType: string; bytes: Uint8Array };

/** A file the user picked, ready to upload. */
export type PickedFile = { name: string; contentType: string; bytes: Uint8Array };

/**
 * Builds a `multipart/form-data` body by hand, byte-for-byte like a browser form submit (including
 * an empty file part when no file is chosen). Returns the body and its Content-Type header.
 */
export function buildMultipart(parts: MultipartPart[]) {
  const boundary = `----GuanChengShi${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const part of parts) {
    if ('bytes' in part) {
      chunks.push(
        encoder.encode(
          `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"; filename="${part.filename.replace(/"/g, '')}"\r\nContent-Type: ${part.contentType}\r\n\r\n`,
        ),
        part.bytes,
        encoder.encode('\r\n'),
      );
    } else {
      chunks.push(encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value}\r\n`));
    }
  }
  chunks.push(encoder.encode(`--${boundary}--\r\n`));
  const body = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    body.set(c, offset);
    offset += c.length;
  }
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}
