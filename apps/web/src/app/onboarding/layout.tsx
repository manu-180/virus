import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bienvenido a Virus',
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {children}
    </div>
  );
}
