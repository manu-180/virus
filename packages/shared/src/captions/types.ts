export interface Word {
  text: string;
  startMs: number;
  endMs: number;
  confidence: number; // 0-1
}

export interface CaptionLine {
  words: Word[];
  startMs: number;
  endMs: number;
  text: string; // join of words
}

export interface Captions {
  language: 'es' | 'en';
  totalDurationMs: number;
  words: Word[];
  lines: CaptionLine[]; // grouped in lines of ~3-5 words (caption-style)
}
