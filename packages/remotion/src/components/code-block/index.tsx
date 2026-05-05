import React, { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { Highlight, themes, type Language } from 'prism-react-renderer';
import { video, colors, radius } from '@virus/shared';
import { jetbrainsFamily } from '@/lib/fonts';

export interface CodeBlockProps {
  code: string;
  language: string;
  themeColor: string;
  highlightLines?: number[];
  animation?: 'typewriter' | 'fade-in' | 'line-by-line';
  maxFontSize?: number;
}

// Custom dark theme inspired by vitesse-dark
const codeTheme = {
  ...themes.nightOwl,
  plain: {
    backgroundColor: video.codeBg,
    color: '#c9d1d9',
  },
};

function estimateFontSize(lineCount: number, maxWidth: number, maxHeight: number, base: number): number {
  const lineHeight = 1.6;
  const fitsHeight = maxHeight / (lineCount * lineHeight);
  return Math.min(base, fitsHeight);
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language,
  themeColor,
  highlightLines = [],
  animation = 'fade-in',
  maxFontSize = video.codeFontSize,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const lines = useMemo(() => code.split('\n'), [code]);
  const lineCount = lines.length;

  // Auto-fit: reduce font if many lines
  const MAX_BOX_HEIGHT = 900;
  const fontSize = useMemo(
    () => estimateFontSize(lineCount, 800, MAX_BOX_HEIGHT, maxFontSize),
    [lineCount, maxFontSize],
  );

  // ── typewriter: visible chars grows from 0 to total
  const totalChars = code.length;
  const visibleChars =
    animation === 'typewriter'
      ? Math.floor(
          interpolate(frame, [0, (totalChars / 60) * fps], [0, totalChars], {
            extrapolateRight: 'clamp',
          }),
        )
      : totalChars;

  const visibleCode = animation === 'typewriter' ? code.slice(0, visibleChars) : code;

  // ── fade-in: whole block scale + opacity
  const blockOpacity =
    animation === 'fade-in'
      ? interpolate(frame, [0, 0.5 * fps], [0, 1], { extrapolateRight: 'clamp' })
      : 1;
  const blockScale =
    animation === 'fade-in'
      ? interpolate(frame, [0, 0.5 * fps], [0.92, 1], { extrapolateRight: 'clamp' })
      : 1;

  // ── line-by-line: each line fades in sequentially (4 frames apart)
  const framesPerLine = Math.max(4, Math.round(fps / 10));

  const containerStyle: React.CSSProperties = {
    backgroundColor: video.codeBg,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: themeColor,
    padding: 32,
    maxWidth: 860,
    width: '100%',
    boxShadow: `0 0 24px ${themeColor}40, 0 0 60px ${themeColor}18`,
    opacity: blockOpacity,
    transform: `scale(${blockScale})`,
  };

  return (
    <div style={containerStyle}>
      <Highlight theme={codeTheme} code={visibleCode} language={language as Language}>
        {({ style, tokens, getLineProps, getTokenProps }) => (
          <pre
            style={{
              ...style,
              fontFamily: jetbrainsFamily,
              fontSize,
              lineHeight: 1.6,
              margin: 0,
              padding: 0,
              overflowX: 'hidden',
              background: 'transparent',
            }}
          >
            {tokens.map((line, lineIdx) => {
              const lineProps = getLineProps({ line });
              const isHighlighted = highlightLines.includes(lineIdx + 1);

              let lineOpacity = 1;
              let lineTranslateY = 0;
              if (animation === 'line-by-line') {
                const lineStart = lineIdx * framesPerLine;
                lineOpacity = interpolate(frame, [lineStart, lineStart + framesPerLine], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                });
                lineTranslateY = interpolate(frame, [lineStart, lineStart + framesPerLine], [12, 0], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                });
              }

              return (
                <div
                  key={lineIdx}
                  {...lineProps}
                  style={{
                    ...lineProps.style,
                    backgroundColor: isHighlighted ? `${themeColor}22` : 'transparent',
                    borderLeft: isHighlighted ? `3px solid ${themeColor}` : '3px solid transparent',
                    paddingLeft: isHighlighted ? 8 : 8,
                    opacity: lineOpacity,
                    transform: `translateY(${lineTranslateY}px)`,
                  }}
                >
                  {line.map((token, tokenIdx) => {
                    const tokenProps = getTokenProps({ token });
                    return <span key={tokenIdx} {...tokenProps} />;
                  })}
                </div>
              );
            })}
          </pre>
        )}
      </Highlight>
    </div>
  );
};
