import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { video, colors, radius, fontWeights } from '@virus/shared';
import { oxaniumFamily } from '@/lib/fonts';

export interface CounterProps {
  current: number;
  total: number;
  themeColor: string;
  position?: 'top-right' | 'top-left' | 'middle';
}

export const Counter: React.FC<CounterProps> = ({
  current,
  total,
  themeColor,
  position = 'top-right',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Number pops in with spring on mount
  const scale = spring({
    fps,
    frame,
    config: { damping: 14, stiffness: 280, mass: 0.7 },
    from: 0.4,
    to: 1,
  });

  const opacity = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: 'clamp' });

  const progress = total > 0 ? current / total : 0;

  const posStyle: React.CSSProperties = (() => {
    const base: React.CSSProperties = { position: 'absolute', zIndex: 10 };
    if (position === 'top-right') {
      return { ...base, top: video.safeTopPx + 24, right: 40 };
    }
    if (position === 'top-left') {
      return { ...base, top: video.safeTopPx + 24, left: 40 };
    }
    return { ...base, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  })();

  return (
    <div style={{ ...posStyle, opacity, transform: `${posStyle.transform ?? ''} scale(${scale})`.trim() }}>
      {/* Number display */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontFamily: oxaniumFamily,
            fontSize: 80,
            fontWeight: fontWeights.black,
            color: themeColor,
            lineHeight: 1,
          }}
        >
          {current}
        </span>
        <span
          style={{
            fontFamily: oxaniumFamily,
            fontSize: 48,
            fontWeight: fontWeights.bold,
            color: `${colors.textSecondary}CC`,
            lineHeight: 1,
          }}
        >
          / {total}
        </span>
      </div>

      {/* Progress bar */}
      <div
        style={{
          marginTop: 8,
          height: 6,
          width: 160,
          borderRadius: radius.full,
          backgroundColor: `${themeColor}33`,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress * 100}%`,
            backgroundColor: themeColor,
            borderRadius: radius.full,
            boxShadow: `0 0 8px ${themeColor}80`,
          }}
        />
      </div>
    </div>
  );
};
