/**
 * Worker entry — exports the registered Inngest functions for the dev server
 * / serve handler to pick up. Inngest's Node SDK takes an array of
 * `inngest.createFunction(...)` results plus the client.
 */

export { inngest } from './inngest/index.js';

import { parseProjectFile } from './functions/parse-project-file.js';
import {
  generateScript,
  synthesizeAudio,
  transcribeAudio,
  renderVideo,
  generateCaption,
  handleFailure,
  generateVisualAssets,
  monitorAssetsFailureRate,
  generateCarouselPlan,
  generateCarouselSlides,
  generateCarouselCaption,
  composeCarouselOverlay,
  regenerateCarouselSlide,
  handleCarouselFailure,
} from './functions/orchestrator.js';
import { detectTrends } from './functions/detect-trends.js';
import { generateVideoProjectAware } from './functions/generate-video-project-aware.js';
import { sweepStuckCarousels } from './functions/sweep-stuck-carousels.js';

export {
  parseProjectFile,
  generateScript,
  synthesizeAudio,
  transcribeAudio,
  renderVideo,
  generateCaption,
  handleFailure,
  detectTrends,
  generateVideoProjectAware,
  generateVisualAssets,
  monitorAssetsFailureRate,
  generateCarouselPlan,
  generateCarouselSlides,
  generateCarouselCaption,
  composeCarouselOverlay,
  regenerateCarouselSlide,
  handleCarouselFailure,
  sweepStuckCarousels,
};

export const functions = [
  parseProjectFile,
  generateScript,
  synthesizeAudio,
  transcribeAudio,
  renderVideo,
  generateCaption,
  handleFailure,
  detectTrends,
  generateVideoProjectAware,
  generateVisualAssets,
  monitorAssetsFailureRate,
  generateCarouselPlan,
  generateCarouselSlides,
  generateCarouselCaption,
  composeCarouselOverlay,
  regenerateCarouselSlide,
  handleCarouselFailure,
  sweepStuckCarousels,
] as const;
