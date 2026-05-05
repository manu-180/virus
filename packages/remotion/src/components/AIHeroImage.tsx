import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { AssetErrorBoundary } from './AssetErrorBoundary';

/**
 * AI-generated hero image used as a cinematic backdrop behind reveal segments.
 * Sits at zIndex 0. Combines a subtle horizontal parallax, a Ken Burns push-in,
 * a dark tint, a radial vignette, and a theme-color glow ring.
 *
 * Stills feel static at 30/60fps so we lean a bit harder on motion than for
 * video b-roll: parallax range -15 → +15 px and a slightly larger Ken Burns
 * scale (1.05 → 1.12) keep the frame alive across a 5-7 second slot.
 *
 * Wrapped in `AssetErrorBoundary` — if the image 404s or fails to decode the
 * backdrop disappears silently.
 */
export interface AIHeroImageProps {
  url: string;
  themeColor: string;
}

export const AIHeroImage: React.FC<AIHeroImageProps> = ({ url, themeColor }) => {
  if (!url) return null;

  return (
    <AssetErrorBoundary>
      <HeroImageInner url={url} themeColor={themeColor} />
    </AssetErrorBoundary>
  );
};

const HeroImageInner: React.FC<AIHeroImageProps> = ({ url, themeColor }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Ken Burns push-in 1.05 → 1.12 (slightly larger range than video b-roll
  // because stills don't have natural motion to mask).
  const scale = interpolate(frame, [0, durationInFrames], [1.05, 1.12], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Horizontal parallax -15 → +15 px across the slot. Subtle but enough to
  // break the static feel of a still image.
  const translateX = interpolate(frame, [0, durationInFrames], [-15, 15], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ zIndex: 0, overflow: 'hidden' }}>
      {/* The image itself, transformed for parallax + Ken Burns. */}
      <AbsoluteFill
        style={{
          transform: `translateX(${translateX}px) scale(${scale})`,
        }}
      >
        <Img
          src={url}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      </AbsoluteFill>

      {/* Dark tint. */}
      <AbsoluteFill style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} />

      {/* Radial vignette. */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 85%, rgba(0,0,0,0.85) 100%)',
        }}
      />

      {/* Theme-color glow ring. */}
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
