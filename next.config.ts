import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: { root: process.cwd() },
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
  async headers() {
    const developmentEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
    // Com HTTPS: navegador só fala HTTPS com o site (HSTS) e sobe pedidos http para https.
    const https = process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") ?? false;
    const secureContext = https ? "; upgrade-insecure-requests" : "";
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          ...(https ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-inline'${developmentEval}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'${secureContext}`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
