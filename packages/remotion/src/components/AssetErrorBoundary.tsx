import React from 'react';

/**
 * Renders `null` when any descendant throws during render.
 *
 * Remotion compositions are pure render trees, so a thrown error in a video/image
 * asset (e.g. signed URL expired, decoder failure, malformed media) would crash
 * the entire frame. This boundary catches the error, logs once via console.warn,
 * and falls back to nothing — the template's existing background (solid color)
 * stays visible underneath.
 *
 * Class component is required because React error boundaries are not supported
 * in function components as of React 19.
 */
export interface AssetErrorBoundaryProps {
  children: React.ReactNode;
}

interface AssetErrorBoundaryState {
  hasError: boolean;
}

export class AssetErrorBoundary extends React.Component<
  AssetErrorBoundaryProps,
  AssetErrorBoundaryState
> {
  override state: AssetErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AssetErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error): void {
    console.warn('[AssetErrorBoundary]', error.message);
  }

  override render(): React.ReactNode {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
