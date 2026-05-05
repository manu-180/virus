import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate, Img } from 'remotion';
import { colors, radius, fontWeights, shadows } from '@virus/shared';
import { oxaniumFamily } from '@/lib/fonts';

export interface TweetMockProps {
  avatar?: string | undefined;
  name: string;
  handle: string;
  text: string;
  themeColor: string;
}

export const TweetMock: React.FC<TweetMockProps> = ({ avatar, name, handle, text, themeColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const translateY = spring({
    fps,
    frame,
    config: { damping: 20, stiffness: 180 },
    from: 60,
    to: 0,
  });

  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  const displayHandle = handle.startsWith('@') ? handle : `@${handle}`;

  return (
    <div
      style={{
        transform: `translateY(${translateY}px)`,
        opacity,
        backgroundColor: colors.bgElevated,
        borderWidth: 2,
        borderStyle: 'solid',
        borderColor: `${themeColor}66`,
        borderRadius: radius['2xl'],
        padding: '32px 36px',
        maxWidth: 860,
        width: '100%',
        boxShadow: shadows.glow(themeColor),
      }}
    >
      {/* Header: avatar + name + X logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: radius.full,
            backgroundColor: `${themeColor}22`,
            border: `2px solid ${themeColor}`,
            overflow: 'hidden',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {avatar ? (
            <Img src={avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span
              style={{
                color: themeColor,
                fontSize: 28,
                fontWeight: fontWeights.bold,
                fontFamily: oxaniumFamily,
              }}
            >
              {name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <p
            style={{
              margin: 0,
              color: colors.textPrimary,
              fontSize: 30,
              fontWeight: fontWeights.bold,
              fontFamily: oxaniumFamily,
              lineHeight: 1.2,
            }}
          >
            {name}
          </p>
          <p
            style={{
              margin: 0,
              color: colors.textSecondary,
              fontSize: 24,
              fontFamily: oxaniumFamily,
            }}
          >
            {displayHandle}
          </p>
        </div>

        {/* X / Twitter logo */}
        <svg width="32" height="32" viewBox="0 0 24 24" fill={colors.textSecondary}>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </div>

      {/* Tweet text */}
      <p
        style={{
          margin: 0,
          color: colors.textPrimary,
          fontSize: 34,
          lineHeight: 1.45,
          fontFamily: oxaniumFamily,
          fontWeight: fontWeights.regular,
        }}
      >
        {text}
      </p>
    </div>
  );
};
