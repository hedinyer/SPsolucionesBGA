import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Día del Tendero 2026 — Participa y gana",
};

export default function NeomundoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[#1a237e] text-white">
      <main className="mx-auto max-w-[414px] pb-[max(1rem,env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  );
}
