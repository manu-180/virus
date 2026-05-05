import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate, Img } from 'remotion';
import { video, colors, radius, fontWeights, shadows } from '@virus/shared';
import { oxaniumFamily } from '@/lib/fonts';

export interface CtaCardProps {
  ctaText: string;
  handle: string;
  themeColor: string;
  logoUrl?: string;
}

export const CtaCard: React.FC<CtaCardProps> = ({ ctaText, handle, themeColor, logoUrl }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const translateY = spring({
    fps,
    frame,
    config: { damping: 18, stiffness: 200 },
    from: 80,
    to: 0,
  });

  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        position: 'absolute',
        bottom: video.safeBottomPx + 40,
        left: 32,
        right: 32,
        transform: `translateY(${translateY}px)`,
        opacity,
      }}
    >
      <div
        style={{
          backgroundColor: colors.bgElevated,
          borderWidth: 2,
          borderStyle: 'solid',
          borderColor: themeColor,
          borderRadius: radius['2xl'],
          padding: '36px 40px',
          boxShadow: shadows.glow(themeColor),
        }}
      >
        {/* CTA text */}
        <p
          style={{
            fontFamily: oxaniumFamily,
            fontSize: 44,
            fontWeight: fontWeights.bold,
            color: colors.textPrimary,
            margin: 0,
            lineHeight: 1.25,
            marginBottom: 20,
          }}
        >
          {ctaText}
        </p>

        {/* Handle row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {logoUrl && (
            <Img
              src={logoUrl}
              style={{
                width: 56,
                height: 56,
                borderRadius: radius.full,
                objectFit: 'cover',
                borderWidth: 2,
                borderStyle: 'solid',
                borderColor: themeColor,
              }}
            />
          )}
          <span
            style={{
              fontFamily: oxaniumFamily,
              fontSize: 36,
              fontWeight: fontWeights.semibold,
              color: themeColor,
            }}
          >
            {handle.startsWith('@') ? handle : `@${handle}`}
          </span>
        </div>
      </div>
    </div>
  );
};
