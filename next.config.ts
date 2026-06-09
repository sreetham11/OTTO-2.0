import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable React Server Components (default in Next.js 15)
  reactStrictMode: true,

  // Server-side environment variables surfaced to route handlers
  serverExternalPackages: ["stripe"],

  // Custom headers for security hardening
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
