/**
 * Reads a plain PCM .wav file (16-bit samples) into one array of samples per channel. The page decodes it itself instead of handing it to the
 * browser's media decoder: on Linux that decoder is GStreamer, and playing the nudge recording through it crashed the desktop app on a system
 * without the right plugins. Samples played through Web Audio need no decoder at all.
 */
export interface Pcm {
  rate: number;
  channels: Float32Array[];
}

export function parseWav(buf: ArrayBuffer): Pcm | null {
  const v = new DataView(buf);
  const tag = (at: number): string => String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3));
  if (v.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let format = 0, channels = 0, rate = 0, bits = 0, dataAt = -1, dataLen = 0;
  for (let at = 12; at + 8 <= v.byteLength;) {
    const id = tag(at);
    const size = v.getUint32(at + 4, true);
    const body = at + 8;
    if (id === 'fmt ') {
      format = v.getUint16(body, true);
      channels = v.getUint16(body + 2, true);
      rate = v.getUint32(body + 4, true);
      bits = v.getUint16(body + 14, true);
    } else if (id === 'data') {
      dataAt = body;
      dataLen = Math.min(size, v.byteLength - body);
      break;
    }
    at = body + size + (size % 2); // chunks are padded to an even length
  }
  if (format !== 1 || bits !== 16 || channels < 1 || rate <= 0 || dataAt < 0) return null;
  const frames = Math.floor(dataLen / (2 * channels));
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let f = 0; f < frames; f += 1) {
    for (let c = 0; c < channels; c += 1) out[c]![f] = v.getInt16(dataAt + (f * channels + c) * 2, true) / 32768;
  }
  return { rate, channels: out };
}
