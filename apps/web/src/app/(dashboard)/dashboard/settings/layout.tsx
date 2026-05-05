import SettingsNav from './_components/SettingsNav';

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg-elevated px-6 py-8">
      <h1 className="text-text-primary font-semibold text-2xl mb-8" style={{ fontFamily: 'Oxanium, sans-serif' }}>
        Configuración
      </h1>

      <div className="md:hidden mb-6 overflow-x-auto">
        <SettingsNav mobile />
      </div>

      <div className="flex gap-8">
        <aside className="hidden md:block w-[200px] shrink-0">
          <SettingsNav />
        </aside>

        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
