declare module '*.md?raw' {
  const content: string;
  export default content;
}

// Optional peer dependency — not installed by default.
// Declared here so that the dynamic import() in whisper-fallback.ts
// type-checks without requiring the package to be installed.
declare module 'nodejs-whisper' {
  interface WhisperWordTimestamp {
    word: string;
    start: number;
    end: number;
  }

  interface WhisperSegment {
    start: number;
    end: number;
    text: string;
    word_timestamps?: WhisperWordTimestamp[];
  }

  interface WhisperResult {
    segments: WhisperSegment[];
  }

  function nodewhisper(
    audioPath: string,
    opts: Record<string, unknown>,
  ): Promise<WhisperResult>;

  export = nodewhisper;
}
