import { loadFont as loadOxaniumFont } from '@remotion/google-fonts/Oxanium';
import { loadFont as loadJetBrainsFont } from '@remotion/google-fonts/JetBrainsMono';

export const { fontFamily: oxaniumFamily } = loadOxaniumFont('normal', {
  weights: ['400', '700', '800'],
  subsets: ['latin'],
});

export const { fontFamily: jetbrainsFamily } = loadJetBrainsFont('normal', {
  weights: ['400', '700'],
  subsets: ['latin'],
});
