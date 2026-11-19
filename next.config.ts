import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // El comprobante de pago se sube con una server action (hasta 5 MB, ver pagarOP).
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
