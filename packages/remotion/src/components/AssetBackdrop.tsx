import React from 'react';
import type { RenderAssets } from '@virus/shared/visuals';
import { AIBackgroundVideo } from './AIBackgroundVideo';
import { AIHeroImage } from './AIHeroImage';

export type AssetSlot = 'hook' | 'reveal' | 'cta';

export interface AssetBackdropProps {
  slot: AssetSlot;
  assets?: RenderAssets;
  themeColor: string;
}

/**
 * Slot-aware router: looks up the asset for a given segment slot
 * (`hook` / `reveal` / `cta`) and delegates to the appropriate backdrop
 * component based on its `type`.
 *
 * Returns `null` (no backdrop) when:
 *  - `assets` is undefined (the pipeline ran without AI assets, e.g. flag off
 *    or generation failed — templates fall back to their solid bg).
 *  - The specific slot has no asset (mixed success: e.g. hook failed but
 *    reveal succeeded).
 */
export const AssetBackdrop: React.FC<AssetBackdropProps> = ({ slot, assets, themeColor }) => {
  const ref = assets?.[slot];
  if (!ref) return null;
  if (ref.type === 'video') {
    return <AIBackgroundVideo url={ref.url} themeColor={themeColor} />;
  }
  return <AIHeroImage url={ref.url} themeColor={themeColor} />;
};
