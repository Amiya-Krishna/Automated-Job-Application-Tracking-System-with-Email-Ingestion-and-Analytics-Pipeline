/**
 * Minimal ArrayBuffer -> base64 encoder, used only to hand a downloaded
 * resume file (PDF/DOCX/TXT, capped at 2 MB — see
 * server/services/resumeTailoring/constants.js) to
 * `expo-file-system`'s base64 write mode, which is what `expo-sharing`
 * needs a real file on disk for.
 *
 * Hermes (React Native's JS engine) has no built-in `Buffer` and no
 * `FileReader.readAsDataURL` on a raw ArrayBuffer, so this avoids pulling
 * in a polyfill package for one small, well-understood conversion.
 */
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let result = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    result += CHARS[bytes[i] >> 2];
    result += CHARS[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
    result += CHARS[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
    result += CHARS[bytes[i + 2] & 63];
  }
  const remaining = bytes.length - i;
  if (remaining === 1) {
    result += CHARS[bytes[i] >> 2];
    result += CHARS[(bytes[i] & 3) << 4];
    result += '==';
  } else if (remaining === 2) {
    result += CHARS[bytes[i] >> 2];
    result += CHARS[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
    result += CHARS[(bytes[i + 1] & 15) << 2];
    result += '=';
  }
  return result;
}

/** Pulls the server-suggested filename out of a Content-Disposition header. */
export function filenameFromContentDisposition(contentDisposition: string | undefined, fallback: string): string {
  const match = /filename="([^"]+)"/.exec(contentDisposition ?? '');
  return match?.[1] ?? fallback;
}