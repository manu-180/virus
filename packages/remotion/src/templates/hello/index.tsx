import React from 'react';
import { AbsoluteFill } from 'remotion';
import { colors, fonts } from '@virus/shared';

export const HelloTemplate: React.FC = () => (
  <AbsoluteFill
    style={{
      background: colors.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <span
      style={{
        fontFamily: fonts.sans,
        fontSize: 128,
        fontWeight: 900,
        color: colors.accent,
        letterSpacing: '-0.02em',
      }}
    >
      Virus
    </span>
  </AbsoluteFill>
);
