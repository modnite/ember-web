import { describe, expect, it } from 'vitest';
import { parseWav } from './wav';

function wav(samples: number[], channels: number, rate: number, extraChunk = false): ArrayBuffer {
  const data = samples.length * 2;
  const extra = extraChunk ? 8 + 3 + 1 : 0; // an odd-sized chunk before the data, padded
  const buf = new ArrayBuffer(44 + extra + data);
  const v = new DataView(buf);
  const put = (at: number, s: string): void => { for (let i = 0; i < 4; i += 1) v.setUint8(at + i, s.charCodeAt(i)); };
  put(0, 'RIFF'); v.setUint32(4, 36 + extra + data, true); put(8, 'WAVE');
  put(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * channels * 2, true); v.setUint16(32, channels * 2, true); v.setUint16(34, 16, true);
  let at = 36;
  if (extraChunk) { put(at, 'LIST'); v.setUint32(at + 4, 3, true); at += 12; }
  put(at, 'data'); v.setUint32(at + 4, data, true);
  samples.forEach((s, i) => v.setInt16(at + 8 + i * 2, s, true));
  return buf;
}

describe('reading a wav file', () => {
  it('reads mono 16-bit samples as -1 to 1', () => {
    const p = parseWav(wav([0, 16384, -32768], 1, 22050))!;
    expect(p.rate).toBe(22050);
    expect(Array.from(p.channels[0]!)).toEqual([0, 0.5, -1]);
  });

  it('splits stereo into two channels and skips other chunks', () => {
    const p = parseWav(wav([1000, -1000, 2000, -2000], 2, 44100, true))!;
    expect(p.channels).toHaveLength(2);
    expect(Array.from(p.channels[1]!).map((x) => Math.round(x * 32768))).toEqual([-1000, -2000]);
  });

  it('refuses what is not a 16-bit PCM wav', () => {
    expect(parseWav(new ArrayBuffer(8))).toBeNull();
    const notWav = wav([0], 1, 8000);
    new DataView(notWav).setUint16(34, 8, true);
    expect(parseWav(notWav)).toBeNull();
  });
});
