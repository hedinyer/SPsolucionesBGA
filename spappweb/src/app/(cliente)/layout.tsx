import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hoja de vida",
};

export default function ClienteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-lg px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <header className="safe-area-top mb-6 flex justify-center">
          <img
            src="/beralogo.jpg"
            alt="Bera"
            className="h-auto w-full max-w-[280px] object-contain"
          />
        </header>
        {children}
      </main>
    </div>
  );
}
