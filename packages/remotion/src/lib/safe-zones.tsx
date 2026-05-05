import React from 'react';
import { video } from '@virus/shared';

export const SafeZones: React.FC<{ enabled?: boolean }> = ({ enabled = false }) => {
  if (!enabled) return null;
  return (
    <>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: video.safeTopPx, background: 'rgba(255,0,0,0.1)' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: video.safeBottomPx, background: 'rgba(255,0,0,0.1)' }} />
    </>
  );
};
