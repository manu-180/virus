import React from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { AssetErrorBoundary } from './AssetErrorBoundary';

/**
 * AI-generated b-roll video used as a cinematic backdrop behind hook/cta
 * segments. Sits at zIndex 0 (under all UI). Apply slow Ken Burns push-in,
 * a dark tint, a radial vignette, and a subtle theme-color glow ring so the
 * video reads as ambience rather than primary content.
 *
 * Renders inside an `AssetErrorBoundary` — if the URL 404s or decoding fails
 * the entire backdrop disappears silently and the template's solid background
 * (set by the parent template) stays visible.
 */
export interface AIBackgroundVideoProps {
  url: string;
  themeColor: string;
}

export const AIBackgroundVideo: React.FC<AIBackgroundVideoProps> = ({ url, themeColor }) => {
  if (!url) return null;

  return (
    <AssetErrorBoundary>
      <BackgroundVideoInner url={url} themeColor={themeColor} />
    </AssetErrorBoundary>
  );
};

const BackgroundVideoInner: React.FC<AIBackgroundVideoProps> = ({ url, themeColor }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Slow Ken Burns push-in across the full slot duration (1.0 → 1.08).
  const scale = interpolate(frame, [0, durationInFrames], [1.0, 1.08], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ zIndex: 0, overflow: 'hidden' }}>
      {/* The video itself, scaled for Ken Burns effect. */}
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <OffthreadVideo
          src={url}
          playbackRate={1}
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      </AbsoluteFill>

      {/* Dark tint — knocks down luminance so foreground UI stays readable. */}
      <AbsoluteFill style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} />

      {/* Radial vignette — focuses attention to the center of the frame. */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 85%, rgba(0,0,0,0.85) 100%)',
        }}
      />

      {/* Theme-color glow ring — inset shadow at low opacity for brand cohesion. */}
      <AbsoluteFill
        style={{
          boxShadow: `inset 0 0 220px ${hexWithAlpha(themeColor, 0.15)}`,
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * Combine a hex color (`#rrggbb`) with an alpha value in [0, 1].
 * Falls back to the input color unchanged if it's not a 6-digit hex.
 */
function hexWithAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${m[1]}${a}`;
}
