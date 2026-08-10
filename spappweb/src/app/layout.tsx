import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SP Admin",
  description: "Panel administrativo SP",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} min-h-full antialiased`}
    >
      <head>
        {/* Evita que extensiones crypto rotas (sin window.ethereum) tumben la app */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{window.ethereum=window.ethereum||{selectedAddress:void 0,isMetaMask:!1}}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-full bg-background font-sans text-foreground">
        <TooltipProvider>
          {children}
          <Toaster
            position="bottom-center"
            richColors={false}
            toastOptions={{
              classNames: {
                toast: "mb-[max(0.5rem,env(safe-area-inset-bottom))]",
              },
            }}
          />
        </TooltipProvider>
      </body>
    </html>
  );
}
