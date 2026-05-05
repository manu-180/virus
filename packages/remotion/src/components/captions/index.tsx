import React, { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { video } from '@virus/shared';
import { oxaniumFamily } from '@/lib/fonts';

interface Word {
  text: string;
  startMs: number;
  endMs: number;
}

export interface CaptionsProps {
  words: Word[];
  themeColor: string;
  style?: 'highlight-word' | 'wipe-line' | 'pop-word';
  position?: 'top' | 'middle' | 'bottom';
  maxWordsPerLine?: number;
}

const FONT_SIZE = 56;
const STROKE_W = video.captionStrokeWidth;

function buildStroke(color: string, w: number): string {
  const h = Math.round(w / 2);
  return [
    `-${w}px -${w}px 0 ${color}`,
    `${w}px -${w}px 0 ${color}`,
    `-${w}px ${w}px 0 ${color}`,
    `${w}px ${w}px 0 ${color}`,
    `0 -${w}px 0 ${color}`,
    `0 ${w}px 0 ${color}`,
    `-${w}px 0 0 ${color}`,
    `${w}px 0 0 ${color}`,
    `-${h}px -${w}px 0 ${color}`,
    `${h}px -${w}px 0 ${color}`,
    `-${h}px ${w}px 0 ${color}`,
    `${h}px ${w}px 0 ${color}`,
    `-${w}px -${h}px 0 ${color}`,
    `${w}px -${h}px 0 ${color}`,
    `-${w}px ${h}px 0 ${color}`,
    `${w}px ${h}px 0 ${color}`,
  ].join(', ');
}

const TEXT_SHADOW = buildStroke(video.captionStrokeColor, STROKE_W);

// ── Highlight-word style ──────────────────────────────────────────────────────

const HighlightWord: React.FC<{
  words: Word[];
  themeColor: string;
  currentMs: number;
  maxWordsPerLine: number;
  frame: number;
  fps: number;
}> = ({ words, themeColor, currentMs, maxWordsPerLine, frame, fps }) => {
  const chunks = useMemo(() => {
    const result: Word[][] = [];
    for (let i = 0; i < words.length; i += maxWordsPerLine) {
      result.push(words.slice(i, i + maxWordsPerLine));
    }
    return result;
  }, [words, maxWordsPerLine]);

  const chunkIndex = useMemo(() => {
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      if (!chunk) continue;
      const last = chunk[chunk.length - 1];
      if (last && currentMs < last.endMs) return ci;
    }
    return Math.max(0, chunks.length - 1);
  }, [chunks, currentMs]);

  const activeChunk = chunks[chunkIndex] ?? [];

  // Fade chunk in quickly
  const opacity = interpolate(frame, [0, 4], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{ opacity, textAlign: 'center', lineHeight: 1.1 }}>
      {activeChunk.map((word, i) => {
        const isActive = currentMs >= word.startMs && currentMs <= word.endMs;
        return (
          <React.Fragment key={`${chunkIndex}-${i}`}>
            <span
              style={{
                fontFamily: oxaniumFamily,
                fontSize: FONT_SIZE,
                fontWeight: 800,
                color: isActive ? themeColor : video.captionDefaultColor,
                textShadow: TEXT_SHADOW,
                display: 'inline',
              }}
            >
              {word.text}
            </span>
            {i < activeChunk.length - 1 && (
              <span
                style={{
                  fontFamily: oxaniumFamily,
                  fontSize: FONT_SIZE,
                  fontWeight: 800,
                  color: video.captionDefaultColor,
                  textShadow: TEXT_SHADOW,
                }}
              >
                {' '}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ── Wipe-line style ───────────────────────────────────────────────────────────

const WipeLine: React.FC<{
  words: Word[];
  themeColor: string;
  currentMs: number;
  maxWordsPerLine: number;
}> = ({ words, themeColor, currentMs, maxWordsPerLine }) => {
  const chunks = useMemo(() => {
    const result: Word[][] = [];
    for (let i = 0; i < words.length; i += maxWordsPerLine) {
      result.push(words.slice(i, i + maxWordsPerLine));
    }
    return result;
  }, [words, maxWordsPerLine]);

  const chunkIndex = useMemo(() => {
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      if (!chunk) continue;
      const last = chunk[chunk.length - 1];
      if (last && currentMs < last.endMs) return ci;
    }
    return Math.max(0, chunks.length - 1);
  }, [chunks, currentMs]);

  const activeChunk = chunks[chunkIndex] ?? [];
  const firstWord = activeChunk[0];
  const lastWord = activeChunk[activeChunk.length - 1];

  const lineStart = firstWord?.startMs ?? 0;
  const lineEnd = lastWord?.endMs ?? lineStart + 1500;
  const lineProgress = Math.min(1, Math.max(0, (currentMs - lineStart) / (lineEnd - lineStart)));

  const text = activeChunk.map((w) => w.text).join(' ');

  return (
    <div style={{ position: 'relative', textAlign: 'center' }}>
      {/* Background text (grey) */}
      <span
        style={{
          fontFamily: oxaniumFamily,
          fontSize: FONT_SIZE,
          fontWeight: 800,
          color: `${video.captionDefaultColor}66`,
          textShadow: TEXT_SHADOW,
        }}
      >
        {text}
      </span>
      {/* Wipe overlay (colored) */}
      <span
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          fontFamily: oxaniumFamily,
          fontSize: FONT_SIZE,
          fontWeight: 800,
          color: themeColor,
          textShadow: TEXT_SHADOW,
          clipPath: `inset(0 ${(1 - lineProgress) * 100}% 0 0)`,
          whiteSpace: 'nowrap',
          width: '100%',
          textAlign: 'center',
        }}
      >
        {text}
      </span>
    </div>
  );
};

// ── Pop-word style ────────────────────────────────────────────────────────────

const PopWord: React.FC<{
  words: Word[];
  themeColor: string;
  currentMs: number;
  maxWordsPerLine: number;
  frame: number;
  fps: number;
}> = ({ words, themeColor, currentMs, maxWordsPerLine, frame, fps }) => {
  const chunks = useMemo(() => {
    const result: Word[][] = [];
    for (let i = 0; i < words.length; i += maxWordsPerLine) {
      result.push(words.slice(i, i + maxWordsPerLine));
    }
    return result;
  }, [words, maxWordsPerLine]);

  const chunkIndex = useMemo(() => {
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      if (!chunk) continue;
      const last = chunk[chunk.length - 1];
      if (last && currentMs < last.endMs) return ci;
    }
    return Math.max(0, chunks.length - 1);
  }, [chunks, currentMs]);

  const activeChunk = chunks[chunkIndex] ?? [];
  const firstWord = activeChunk[0];
  const chunkStartMs = firstWord?.startMs ?? 0;
  const chunkStartFrame = Math.round((chunkStartMs / 1000) * fps);

  return (
    <div style={{ textAlign: 'center', lineHeight: 1.1 }}>
      {activeChunk.map((word, i) => {
        const wordStartFrame = Math.round((word.startMs / 1000) * fps);
        const elapsed = frame - wordStartFrame;
        const hasStarted = elapsed >= 0;

        const scale = hasStarted
          ? spring({
              fps,
              frame: elapsed,
              config: { damping: 12, stiffness: 300, mass: 0.6 },
              from: 0.5,
              to: 1,
            })
          : 0;

        const isActive = currentMs >= word.startMs && currentMs <= word.endMs;

        return (
          <React.Fragment key={`${chunkStartFrame}-${i}`}>
            <span
              style={{
                display: 'inline-block',
                transform: `scale(${scale})`,
                fontFamily: oxaniumFamily,
                fontSize: FONT_SIZE,
                fontWeight: 800,
                color: isActive ? themeColor : video.captionDefaultColor,
                textShadow: TEXT_SHADOW,
                transformOrigin: 'center bottom',
              }}
            >
              {word.text}
            </span>
            {i < activeChunk.length - 1 && (
              <span
                style={{
                  fontFamily: oxaniumFamily,
                  fontSize: FONT_SIZE,
                  fontWeight: 800,
                  color: video.captionDefaultColor,
                  textShadow: TEXT_SHADOW,
                }}
              >
                {' '}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export const Captions: React.FC<CaptionsProps> = ({
  words,
  themeColor,
  style = 'highlight-word',
  position = 'bottom',
  maxWordsPerLine = 4,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentMs = (frame / fps) * 1000;

  const posStyle: React.CSSProperties = useMemo(() => {
    const base: React.CSSProperties = {
      position: 'absolute',
      left: 0,
      right: 0,
      padding: '0 40px',
    };
    if (position === 'bottom') return { ...base, bottom: video.safeBottomPx };
    if (position === 'top') return { ...base, top: video.safeTopPx };
    return { ...base, top: '50%', transform: 'translateY(-50%)' };
  }, [position]);

  return (
    <div style={posStyle}>
      {style === 'highlight-word' && (
        <HighlightWord
          words={words}
          themeColor={themeColor}
          currentMs={currentMs}
          maxWordsPerLine={maxWordsPerLine}
          frame={frame}
          fps={fps}
        />
      )}
      {style === 'wipe-line' && (
        <WipeLine
          words={words}
          themeColor={themeColor}
          currentMs={currentMs}
          maxWordsPerLine={maxWordsPerLine}
        />
      )}
      {style === 'pop-word' && (
        <PopWord
          words={words}
          themeColor={themeColor}
          currentMs={currentMs}
          maxWordsPerLine={maxWordsPerLine}
          frame={frame}
          fps={fps}
        />
      )}
    </div>
  );
};
