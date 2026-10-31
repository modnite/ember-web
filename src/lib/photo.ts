// How a photo is sent: Standard is smaller and sends faster, HD keeps much more detail. Neither is the untouched original.
// The numbers and the rules follow the Android app (data/MediaCompressor.kt). Videos are sent as they are: a browser cannot shrink them well.

export type Quality = 'standard' | 'hd';

/** Longest side of a photo, in pixels, and the JPEG quality (0 to 1). */
export const photoEdge = (q: Quality): number => (q === 'hd' ? 4096 : 1600);
export const photoJpeg = (q: Quality): number => (q === 'hd' ? 0.92 : 0.8);

/** The size a picture is brought to: never enlarged, the long side at most `maxEdge`, both sides at least 1. */
export function fitSize(w: number, h: number, maxEdge: number): [number, number] {
  const long = Math.max(w, h);
  if (long <= maxEdge) return [w, h];
  const k = maxEdge / long;
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
}

/** "holiday.png" becomes "holiday.jpg". */
export const jpegName = (name: string): string => `${name.replace(/\.[^./\\]+$/, '') || 'photo'}.jpg`;

const PHOTO = /^image\/(jpeg|png|webp|heic|heif)$/;

/** True when the first bytes say the file is a WebP that may move or have see-through parts (the extended format). */
async function isExtendedWebp(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const at = (i: number, s: string): boolean => s.split('').every((c, k) => head[i + k] === c.charCodeAt(0));
  return head.length >= 16 && at(0, 'RIFF') && at(8, 'WEBP') && at(12, 'VP8X');
}

/** Whether any pixel of the picture is see-through (checked on a small copy). */
function hasAlpha(bmp: ImageBitmap): boolean {
  const c = document.createElement('canvas');
  c.width = 48;
  c.height = 48;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return false;
  g.drawImage(bmp, 0, 0, 48, 48);
  const px = g.getImageData(0, 0, 48, 48).data;
  for (let i = 3; i < px.length; i += 4) if (px[i]! < 250) return true;
  return false;
}

/**
 * The file to upload: a photo brought down to the chosen quality, or the file itself when it should not change (a GIF, a sticker, a picture
 * with see-through parts, a moving WebP, anything that is not a photo, or a JPEG that comes out no smaller).
 */
export async function preparePhoto(file: File, quality: Quality): Promise<File> {
  try {
    if (!PHOTO.test(file.type) || /^sticker-/.test(file.name)) return file;
    if (file.type === 'image/webp' && (await isExtendedWebp(file))) return file;
    const bmp = await createImageBitmap(file);
    if (file.type !== 'image/jpeg' && hasAlpha(bmp)) {
      bmp.close?.();
      return file;
    }
    const [w, h] = fitSize(bmp.width, bmp.height, photoEdge(quality));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const jpeg = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', photoJpeg(quality)));
    if (!jpeg || jpeg.type !== 'image/jpeg') return file;
    if (file.type === 'image/jpeg' && jpeg.size >= file.size) return file;
    return new File([jpeg], jpegName(file.name), { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  }
}
