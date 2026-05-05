export type VoiceModel = 'eleven_multilingual_v2' | 'eleven_v3' | 'eleven_turbo_v2_5';

export interface VoicePreset {
  name: string;
  modelId: VoiceModel;
  stability: number;          // 0-1
  similarityBoost: number;    // 0-1
  style?: number;             // 0-1 (solo v3)
  speakerBoost: boolean;
  outputFormat: 'mp3_44100_192' | 'mp3_44100_128' | 'pcm_44100';
}

// Presets por formato de video (de proyecto.md §4)
export const VOICE_PRESETS: Record<string, VoicePreset> = {
  // Tip único / educacional: tono claro, energético
  educational: {
    name: 'Educational',
    modelId: 'eleven_multilingual_v2',
    stability: 0.45,
    similarityBoost: 0.8,
    speakerBoost: true,
    outputFormat: 'mp3_44100_192',
  },
  // Hot take: más sarcasmo, menor stability
  hotTake: {
    name: 'Hot Take',
    modelId: 'eleven_multilingual_v2',
    stability: 0.35,
    similarityBoost: 0.85,
    speakerBoost: true,
    outputFormat: 'mp3_44100_192',
  },
  // Speed build: rápido, alta energía
  speedBuild: {
    name: 'Speed Build',
    modelId: 'eleven_turbo_v2_5',     // más rápido para iterar
    stability: 0.4,
    similarityBoost: 0.75,
    speakerBoost: true,
    outputFormat: 'mp3_44100_192',
  },
  // Story / horror: más pausado, dramatic
  story: {
    name: 'Story',
    modelId: 'eleven_multilingual_v2',
    stability: 0.6,
    similarityBoost: 0.8,
    style: 0.3,
    speakerBoost: true,
    outputFormat: 'mp3_44100_192',
  },
};

// Velocidad de aceleración en post (proyecto.md: 1.1×–1.3×)
export const POST_PROCESSING = {
  speedMultiplier: 1.15,             // Manuel acelera en post con ffmpeg
  targetLufs: -15,
  compressorRatio: 3,
  highpassHz: 80,
};
