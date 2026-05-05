import type { Metadata } from 'next';
import { oxanium, jetbrainsMono } from '@/styles/fonts';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/sonner';
import { PHProvider } from '@/providers/posthog-provider';
import PostHogPageView from '@/components/posthog-page-view';
import './globals.css';

export const metadata: Metadata = {
  title: 'Virus',
  description: 'Dev content, weaponized.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn(oxanium.variable, jetbrainsMono.variable)}>
      <body>
        <PHProvider>
          <PostHogPageView />
          {children}
          <Toaster />
        </PHProvider>
      </body>
    </html>
  );
}
