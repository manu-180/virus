import React from 'react';
import { AIBackgroundVideo } from './AIBackgroundVideo';
import { AIHeroImage } from './AIHeroImage';

// TODO: import from @virus/shared/visuals once Phase 2 ships and the visuals
// subpath is added to packages/shared/package.json `exports`. The shape below
// must stay in sync with `packages/shared/src/visuals/types.ts`.
type AssetType = 'video' | 'image';

interface AssetRef {
  url: string;
  type: AssetType;
  durationSec?: number;
}

interface RenderAssets {
  hook?: AssetRef;
  reveal?: AssetRef;
  cta?: AssetRef;
}

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
