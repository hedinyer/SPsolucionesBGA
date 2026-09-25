import path from "node:path";
import type { NextConfig } from "next";

const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const projectRoot = path.resolve(__dirname);

const nextConfig: NextConfig = {
  // El git root está en el padre (SPsolucionesBGA). Turbopack a veces
  // infiere esa raíz y el árbol de rutas queda vacío (todas las páginas 404).
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
  reactCompiler: true,
  serverExternalPackages: ["sharp"],
  experimental: {
    serverActions: {
      // Fotos de cámara móvil pueden superar 1 MB (límite por defecto de Next.js)
      bodySizeLimit: "15mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
