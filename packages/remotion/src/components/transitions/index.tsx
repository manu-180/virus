import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, AbsoluteFill } from 'remotion';

// ── WipeTransition ────────────────────────────────────────────────────────────
// Renders a solid dark bar that sweeps across the frame.
// Mount in a <Sequence> at the cut point; the bar appears and disappears.

export interface WipeTransitionProps {
  direction?: 'left' | 'right' | 'up' | 'down';
  durationFrames?: number;
  color?: string;
}

export const WipeTransition: React.FC<WipeTransitionProps> = ({
  direction = 'left',
  durationFrames = 20,
  color = '#000000',
}) => {
  const frame = useCurrentFrame();
  const half = durationFrames / 2;

  // In: bar grows from 0% to 100%; Out: bar shrinks from 100% to 0%
  const size = interpolate(
    frame,
    [0, half, half, durationFrames],
    [0, 100, 100, 0],
    { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' },
  );

  const isHorizontal = direction === 'left' || direction === 'right';
  const fromEnd = direction === 'right' || direction === 'down';

  const barStyle: React.CSSProperties = isHorizontal
    ? {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: `${size}%`,
        [fromEnd ? 'right' : 'left']: 0,
        backgroundColor: color,
      }
    : {
        position: 'absolute',
        left: 0,
        right: 0,
        height: `${size}%`,
        [fromEnd ? 'bottom' : 'top']: 0,
        backgroundColor: color,
      };

  if (size <= 0) return null;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={barStyle} />
    </AbsoluteFill>
  );
};

// ── GlitchTransition ──────────────────────────────────────────────────────────
// Full-frame RGB-shift + scanline noise overlay.

export interface GlitchTransitionProps {
  durationFrames?: number;
}

export const GlitchTransition: React.FC<GlitchTransitionProps> = ({
  durationFrames = 12,
}) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(
    frame,
    [0, 2, durationFrames - 2, durationFrames],
    [0, 1, 1, 0],
    { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' },
  );

  if (opacity <= 0) return null;

  const redX = Math.sin(frame * 2.1) * 10;
  const blueX = Math.cos(frame * 3.3) * 10;
  const noiseY = Math.sin(frame * 5.7) * 4;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity }}>
      {/* Red ghost */}
      <AbsoluteFill
        style={{
          backgroundColor: 'rgba(255,0,50,0.35)',
          transform: `translate(${redX}px, ${noiseY}px)`,
          mixBlendMode: 'screen',
        }}
      />
      {/* Blue ghost */}
      <AbsoluteFill
        style={{
          backgroundColor: 'rgba(0,80,255,0.35)',
          transform: `translate(${blueX}px, ${-noiseY}px)`,
          mixBlendMode: 'screen',
        }}
      />
      {/* Scanline overlay */}
      <AbsoluteFill
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 2px, transparent 2px, transparent 4px)',
          mixBlendMode: 'multiply',
        }}
      />
    </AbsoluteFill>
  );
};

// ── ZoomPunch ─────────────────────────────────────────────────────────────────
// Wraps children with a momentary scale punch on frame 0.

export interface ZoomPunchProps {
  scale?: number;
  durationFrames?: number;
  children: React.ReactNode;
}

export const ZoomPunch: React.FC<ZoomPunchProps> = ({
  scale: peakScale = 1.08,
  durationFrames = 10,
  children,
}) => {
  const frame = useCurrentFrame();

  const currentScale = interpolate(
    frame,
    [0, Math.floor(durationFrames * 0.35), durationFrames],
    [1, peakScale, 1],
    {
      extrapolateRight: 'clamp',
      extrapolateLeft: 'clamp',
    },
  );

  return (
    <AbsoluteFill
      style={{
        transform: `scale(${currentScale})`,
        transformOrigin: 'center center',
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

// ── FlashTransition ───────────────────────────────────────────────────────────
// Single bright flash that fades quickly — great for cuts.

export interface FlashTransitionProps {
  color?: string;
  durationFrames?: number;
}

export const FlashTransition: React.FC<FlashTransitionProps> = ({
  color = '#FFFFFF',
  durationFrames = 8,
}) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(
    frame,
    [0, 1, durationFrames],
    [0, 1, 0],
    { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' },
  );

  if (opacity <= 0) return null;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: color,
        opacity,
        pointerEvents: 'none',
      }}
    />
  );
};
