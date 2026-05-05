import fs from 'fs';
import path from 'path';

export const SAMPLE_WAV_PATH = path.join(__dirname, 'sample-voice.wav');

// Generates a minimal valid PCM WAV: mono 44100Hz 16-bit, ~1s of silence.
export function ensureSampleWav(): string {
  if (fs.existsSync(SAMPLE_WAV_PATH)) return SAMPLE_WAV_PATH;

  const sampleRate = 44100;
  const numSamples = sampleRate; // 1 second
  const dataSize = numSamples * 2; // 16-bit = 2 bytes/sample
  const buf = Buffer.alloc(44 + dataSize);
  let o = 0;

  buf.write('RIFF', o); o += 4;
  buf.writeUInt32LE(36 + dataSize, o); o += 4;
  buf.write('WAVE', o); o += 4;
  buf.write('fmt ', o); o += 4;
  buf.writeUInt32LE(16, o); o += 4;          // fmt chunk size
  buf.writeUInt16LE(1, o); o += 2;           // PCM
  buf.writeUInt16LE(1, o); o += 2;           // mono
  buf.writeUInt32LE(sampleRate, o); o += 4;
  buf.writeUInt32LE(sampleRate * 2, o); o += 4; // byte rate
  buf.writeUInt16LE(2, o); o += 2;           // block align
  buf.writeUInt16LE(16, o); o += 2;          // bits per sample
  buf.write('data', o); o += 4;
  buf.writeUInt32LE(dataSize, o);
  // remaining bytes are 0 = silence

  fs.writeFileSync(SAMPLE_WAV_PATH, buf);
  return SAMPLE_WAV_PATH;
}
