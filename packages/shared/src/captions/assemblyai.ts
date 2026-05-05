import type { Captions, Word } from './types.js';
import { groupWordsIntoLines } from './segment-mapper.js';

// ---------------------------------------------------------------------------
// AssemblyAI response shape (relevant fields only)
// ---------------------------------------------------------------------------

interface AssemblyAIWord {
  text: string;
  start: number; // ms
  end: number;   // ms
  confidence: number;
}

interface AssemblyAITranscript {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  error?: string;
  text: string | null;
  words: AssemblyAIWord[] | null;
  audio_duration: number | null; // seconds
}

// ---------------------------------------------------------------------------
// Language code mapping
// ---------------------------------------------------------------------------

const LANGUAGE_CODE: Record<'es' | 'en', string> = {
  es: 'es',
  en: 'en',
};

const WORD_BOOST = ['Cursor', 'Claude', 'TypeScript', 'React', 'Next.js', 'Supabase'];

const BASE_URL = 'https://api.assemblyai.com/v2';
const POLL_INTERVAL_MS = 1000;
const MAX_RETRIES = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveApiKey(provided?: string): string {
  const key = provided ?? process.env['ASSEMBLYAI_API_KEY'];
  if (!key) {
    throw new Error(
      '[assemblyai] No API key found. Set ASSEMBLYAI_API_KEY env var or pass apiKey.',
    );
  }
  return key;
}

async function postTranscript(
  audioUrl: string,
  language: 'es' | 'en',
  apiKey: string,
): Promise<string> {
  const response = await fetch(`${BASE_URL}/transcript`, {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      language_code: LANGUAGE_CODE[language],
      speech_models: ['universal-2'],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `[assemblyai] Failed to submit transcript: HTTP ${response.status} — ${body}`,
    );
  }

  const data = (await response.json()) as { id: string };
  return data.id;
}

async function pollTranscript(
  id: string,
  apiKey: string,
): Promise<AssemblyAITranscript> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(`${BASE_URL}/transcript/${id}`, {
      headers: { authorization: apiKey },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `[assemblyai] Poll failed: HTTP ${response.status} — ${body}`,
      );
    }

    const transcript = (await response.json()) as AssemblyAITranscript;

    if (transcript.status === 'completed') return transcript;

    if (transcript.status === 'error') {
      throw new Error(
        `[assemblyai] Transcription failed: ${transcript.error ?? 'unknown error'}`,
      );
    }

    await sleep(POLL_INTERVAL_MS); // sleep AFTER checking, not before
  }

  throw new Error(
    `[assemblyai] Transcription timed out after ${MAX_RETRIES}s for transcript id=${id}`,
  );
}

function mapWords(raw: AssemblyAIWord[]): Word[] {
  return raw.map((w) => ({
    text: w.text,
    startMs: w.start,
    endMs: w.end,
    confidence: w.confidence,
  }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function transcribeWithAssemblyAI(input: {
  audioUrl: string;
  language: 'es' | 'en';
  apiKey?: string;
}): Promise<Captions> {
  const apiKey = resolveApiKey(input.apiKey);

  const id = await postTranscript(input.audioUrl, input.language, apiKey);
  console.log(`[assemblyai] Transcript submitted, id=${id}. Polling...`);

  const transcript = await pollTranscript(id, apiKey);
  console.log(`[assemblyai] Transcript completed, id=${id}`);

  const words = mapWords(transcript.words ?? []);
  if (words.length === 0) {
    console.warn(`[assemblyai] Transcript completed but returned 0 words (id=${id}). Audio may be silent or language mismatch.`);
  }
  const lines = groupWordsIntoLines(words);
  const totalDurationMs = (transcript.audio_duration ?? 0) * 1000;

  return {
    language: input.language,
    totalDurationMs,
    words,
    lines,
  };
}
