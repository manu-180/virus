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
  composeCarouselOverlay,
} from './functions/orchestrator.js';
import { detectTrends } from './functions/detect-trends.js';
import { generateVideoProjectAware } from './functions/generate-video-project-aware.js';

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
  composeCarouselOverlay,
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
  composeCarouselOverlay,
] as const;
