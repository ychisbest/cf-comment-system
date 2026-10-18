export interface ImageType {
  mime: string;
  ext: string;
}

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

const startsWith = (b: Uint8Array, sig: number[], off = 0) => sig.every((v, i) => b[off + i] === v);

/** 通过文件头魔数识别图片类型；不信任 Content-Type 与扩展名。SVG 等一律返回 null。 */
export function detectImageType(b: Uint8Array): ImageType | null {
  if (b.length < 12) return null;
  if (startsWith(b, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', ext: 'jpg' };
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: 'image/png', ext: 'png' };
  if (startsWith(b, [0x47, 0x49, 0x46, 0x38]) && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return { mime: 'image/gif', ext: 'gif' };
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) return { mime: 'image/webp', ext: 'webp' };
  return null;
}

export const EXT_MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };

export const IMAGE_KEY_RE = /^uploads\/[A-Za-z0-9_-]{1,64}\/\d{6}\/[0-9a-f-]{36}\.(jpg|png|gif|webp)$/;

export function makeImageKey(siteId: string, ext: string, d = new Date()): string {
  const ym = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return `uploads/${siteId}/${ym}/${crypto.randomUUID()}.${ext}`;
}
