/** Should a video tile be drawn mirrored? One rule, in one place, instead of leaving it to whatever the
 *  browser or the video library guesses (Safari reports no `facingMode`, so the library's own guess
 *  left a front camera un-mirrored there).
 *
 *  - Your own front (or unknown, i.e. a laptop webcam) camera is mirrored, like a mirror.
 *  - The back camera is never mirrored: text in front of it must read correctly.
 *  - Everyone else's picture is never mirrored: it is what their camera sees.
 *  - A screen share is never mirrored. */
export interface MirrorInput {
  /** The tile shows your own video. */
  local: boolean;
  source?: 'camera' | 'screen';
  /** `track.getSettings().facingMode` when the browser reports one. */
  facingMode?: string | null;
  /** `track.label`: iOS says "Back Camera", Android "camera2 0, facing back". */
  label?: string | null;
}

const BACK_LABEL = /\b(back|rear|environment)\b|facing back/i;

export function isBackCamera(facingMode?: string | null, label?: string | null): boolean {
  if (facingMode === 'environment') return true;
  if (facingMode === 'user') return false;
  return Boolean(label && BACK_LABEL.test(label));
}

export function shouldMirror(i: MirrorInput): boolean {
  if (!i.local) return false;
  if (i.source === 'screen') return false;
  return !isBackCamera(i.facingMode, i.label);
}

/** The CSS transform for a decision. Always explicit, so a library's own transform cannot win. */
export function mirrorTransform(mirror: boolean): string {
  return mirror ? 'scaleX(-1)' : 'none';
}
