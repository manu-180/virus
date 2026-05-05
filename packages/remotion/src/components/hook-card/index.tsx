import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { colors, radius, fontWeights, shadows } from '@virus/shared';
import { oxaniumFamily } from '@/lib/fonts';

export interface HookCardProps {
  text: string;
  themeColor: string;
  variant: 'punch' | 'glitch' | 'slide';
}

const MAX_CHARS = 80;

// ── Punch variant ─────────────────────────────────────────────────────────────

const PunchCard: React.FC<{ text: string; themeColor: string }> = ({ text, themeColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    fps,
    frame,
    config: { damping: 8, stiffness: 400, mass: 0.5 },
    from: 0,
    to: 1,
  });

  const opacity = interpolate(frame, [0, 3], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        transform: `scale(${scale})`,
        opacity,
        backgroundColor: `${colors.bg}CC`,
        borderWidth: 4,
        borderStyle: 'solid',
        borderColor: themeColor,
        borderRadius: radius['2xl'],
        padding: '48px 56px',
        maxWidth: 900,
        boxShadow: shadows.glow(themeColor),
      }}
    >
      <p
        style={{
          fontFamily: oxaniumFamily,
          fontSize: 96,
          fontWeight: fontWeights.black,
          color: colors.textPrimary,
          margin: 0,
          lineHeight: 1.1,
          textAlign: 'center',
        }}
      >
        {text.slice(0, MAX_CHARS)}
      </p>
    </div>
  );
};

// ── Glitch variant ────────────────────────────────────────────────────────────

const GlitchCard: React.FC<{ text: string; themeColor: string }> = ({ text, themeColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: 'clamp' });

  // RGB shift oscillation — fast jitter that settles
  const jitterDecay = interpolate(frame, [0, 1.5 * fps], [1, 0], { extrapolateRight: 'clamp' });
  const redX = Math.sin(frame * 1.7) * 6 * jitterDecay;
  const blueX = Math.cos(frame * 2.3) * 6 * jitterDecay;
  const noiseY = Math.sin(frame * 3.1) * 3 * jitterDecay;

  const textStyle: React.CSSProperties = {
    fontFamily: oxaniumFamily,
    fontSize: 96,
    fontWeight: fontWeights.black,
    color: colors.textPrimary,
    margin: 0,
    lineHeight: 1.1,
    textAlign: 'center',
    position: 'relative',
  };

  return (
    <div
      style={{
        opacity,
        backgroundColor: `${colors.bg}CC`,
        borderWidth: 4,
        borderStyle: 'solid',
        borderColor: themeColor,
        borderRadius: radius['2xl'],
        padding: '48px 56px',
        maxWidth: 900,
        boxShadow: shadows.glow(themeColor),
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'relative' }}>
        {/* Red channel ghost */}
        <p
          style={{
            ...textStyle,
            position: 'absolute',
            color: `rgba(255,0,0,0.5)`,
            transform: `translate(${redX}px, ${noiseY}px)`,
            top: 0,
            left: 0,
            right: 0,
            mixBlendMode: 'screen',
          }}
        >
          {text.slice(0, MAX_CHARS)}
        </p>
        {/* Blue channel ghost */}
        <p
          style={{
            ...textStyle,
            position: 'absolute',
            color: `rgba(0,100,255,0.5)`,
            transform: `translate(${blueX}px, ${-noiseY}px)`,
            top: 0,
            left: 0,
            right: 0,
            mixBlendMode: 'screen',
          }}
        >
          {text.slice(0, MAX_CHARS)}
        </p>
        {/* Main text */}
        <p style={textStyle}>{text.slice(0, MAX_CHARS)}</p>
      </div>
    </div>
  );
};

// ── Slide variant ─────────────────────────────────────────────────────────────

const SlideCard: React.FC<{ text: string; themeColor: string }> = ({ text, themeColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const translateY = spring({
    fps,
    frame,
    config: { damping: 20, stiffness: 180 },
    from: 120,
    to: 0,
  });

  const blur = interpolate(frame, [0, 0.5 * fps], [8, 0], { extrapolateRight: 'clamp' });
  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        transform: `translateY(${translateY}px)`,
        opacity,
        filter: `blur(${blur}px)`,
        backgroundColor: `${colors.bg}CC`,
        borderWidth: 4,
        borderStyle: 'solid',
        borderColor: themeColor,
        borderRadius: radius['2xl'],
        padding: '48px 56px',
        maxWidth: 900,
        boxShadow: shadows.glow(themeColor),
      }}
    >
      <p
        style={{
          fontFamily: oxaniumFamily,
          fontSize: 96,
          fontWeight: fontWeights.black,
          color: colors.textPrimary,
          margin: 0,
          lineHeight: 1.1,
          textAlign: 'center',
        }}
      >
        {text.slice(0, MAX_CHARS)}
      </p>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export const HookCard: React.FC<HookCardProps> = ({ text, themeColor, variant }) => {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 40px',
      }}
    >
      {variant === 'punch' && <PunchCard text={text} themeColor={themeColor} />}
      {variant === 'glitch' && <GlitchCard text={text} themeColor={themeColor} />}
      {variant === 'slide' && <SlideCard text={text} themeColor={themeColor} />}
    </div>
  );
};
