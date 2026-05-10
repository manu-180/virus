export interface SynthesizeOptions {
  text: string;
  voiceId?: string;
  preset?: string;
  outputPath: string;
}

export interface SynthesizeResult {
  filePath: string;
  durationSec: number;
  bytes: number;
}

export interface ElevenLabsError {
  message: string;
  code: string;
  httpStatus: number;
}

export interface PostProcessOptions {
  inputPath: string;
  outputPath: string;
  speedMultiplier?: number;
  targetLufs?: number;
  highpassHz?: number;
}

export interface PostProcessResult {
  filePath: string;
  durationSec: number;
}

export interface GenerateAudioInput {
  segments: Array<{ voiceover: string }>;
  preset: import('./voice-config').VoicePreset;
  outputDir: string;
  voiceId?: string;
}

export interface SegmentTiming {
  index: number;
  startSec: number;
  endSec: number;
}

export interface GenerateAudioResult {
  rawMp3: string;
  processedMp3: string;
  durationSec: number;
  perSegmentTimings: SegmentTiming[];
}
