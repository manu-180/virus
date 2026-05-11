import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Page() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-6">
        <h1 className="text-7xl font-black">Virus</h1>
        <p className="text-text-secondary text-xl">Dev content, weaponized.</p>
        <Button size="lg" asChild>
          <Link href="/login">Get started</Link>
        </Button>
      </div>
    </main>
  );
}
