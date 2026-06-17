// whisper output format varies by version; this mapping may need adjustment
// when nodejs-whisper stabilizes its output shape.

import type { Captions, Word } from './types.js';
import { groupWordsIntoLines } from './segment-mapper.js';

// ---------------------------------------------------------------------------
// nodejs-whisper expected output types (best-effort, version-dependent)
// ---------------------------------------------------------------------------

interface WhisperWordTimestamp {
  word: string;
  start: number; // seconds
  end: number;   // seconds
}

interface WhisperSegment {
  start: number;  // seconds
  end: number;    // seconds
  text: string;
  word_timestamps?: WhisperWordTimestamp[];
}

interface WhisperResult {
  segments: WhisperSegment[];
}

type WhisperFn = (audioPath: string, opts: Record<string, unknown>) => Promise<WhisperResult>;

// ---------------------------------------------------------------------------
// Dynamic import helper
// ---------------------------------------------------------------------------

async function loadWhisper(): Promise<WhisperFn> {
  try {
    // nodejs-whisper is an optional peer dependency that may not be installed.
    // The indirect specifier keeps TypeScript from resolving the module at
    // compile time (so consumers like @virus/worker type-check without it
    // installed) while still importing it at runtime when present. The result
    // is cast to the locally-defined WhisperFn, so we lose no useful typing.
    const moduleName = 'nodejs-whisper';
    const mod = await import(moduleName);
    // nodejs-whisper exports { nodewhisper } as named export
    const fn = (mod as Record<string, unknown>)['nodewhisper'] ?? (mod as Record<string, unknown>)['default'];
    if (typeof fn !== 'function') {
      throw new Error('[whisper] Unexpected nodejs-whisper export shape — expected nodewhisper function');
    }
    return fn as WhisperFn;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') {
      throw new Error('nodejs-whisper not installed. Run: pnpm add nodejs-whisper');
    }
    throw err; // rethrow original error (model download failure, binary issue, etc.)
  }
}

// ---------------------------------------------------------------------------
// Word extraction
// ---------------------------------------------------------------------------

function extractWords(result: WhisperResult): Word[] {
  if (!Array.isArray(result?.segments)) {
    throw new Error('[whisper] Unexpected result shape — segments array missing');
  }
  const words: Word[] = [];

  for (const segment of result.segments) {
    if (segment.word_timestamps && segment.word_timestamps.length > 0) {
      for (const wt of segment.word_timestamps) {
        words.push({
          text: wt.word.trim(),
          startMs: Math.round(wt.start * 1000),
          endMs: Math.round(wt.end * 1000),
          confidence: 1, // nodejs-whisper does not expose per-word confidence
        });
      }
    } else {
      // Fallback: treat the whole segment as a single "word" entry
      words.push({
        text: segment.text.trim(),
        startMs: Math.round(segment.start * 1000),
        endMs: Math.round(segment.end * 1000),
        confidence: 1,
      });
    }
  }

  return words;
}

function totalDurationMs(result: WhisperResult): number {
  if (result.segments.length === 0) return 0;
  const last = result.segments[result.segments.length - 1]!;
  return Math.round(last.end * 1000);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function transcribeWithWhisper(input: {
  audioPath: string;
  language: 'es' | 'en';
}): Promise<Captions> {
  const nodewhisper = await loadWhisper();

  console.log(`[whisper] Transcribing ${input.audioPath} (model=medium, lang=${input.language})`);

  const result = await nodewhisper(input.audioPath, {
    modelName: 'medium',
    autoDownloadModelName: 'medium',
    whisperOptions: {
      outputInText: false,
      outputInVtt: false,
      outputInSrt: false,
      outputInJson: true,
      splitOnWord: true,
      language: input.language,
    },
  });

  const words = extractWords(result);
  const lines = groupWordsIntoLines(words);

  return {
    language: input.language,
    totalDurationMs: totalDurationMs(result),
    words,
    lines,
  };
}
