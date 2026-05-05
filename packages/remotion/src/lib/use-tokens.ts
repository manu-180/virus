import { colors, fonts, video } from '@virus/shared';

export function useTokens(themeColor?: string) {
  return {
    ...colors,
    accent: themeColor ?? colors.accent,
    fonts,
    video,
  };
}
