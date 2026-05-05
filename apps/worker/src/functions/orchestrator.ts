/**
 * orchestrator — Re-exports all Inngest functions in the video generation pipeline.
 * Register these with the Inngest serve handler alongside parseProjectFile.
 */
export { generateScript } from './generate-script.js';
export { synthesizeAudio } from './synthesize-audio.js';
export { transcribeAudio } from './transcribe-audio.js';
export { renderVideo } from './render-video.js';
export { generateCaption } from './generate-caption.js';
export { handleFailure } from './handle-failure.js';
export { generateVisualAssets } from './generate-visual-assets.js';
export { monitorAssetsFailureRate } from './monitor-assets-failure-rate.js';
