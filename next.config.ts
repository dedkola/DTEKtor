import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/sw.js", headers: [
      { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
      { key: "Content-Type", value: "application/javascript; charset=utf-8" },
      { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
    ] }];
  },
  env: {
    // Next inlines this value into the build; runtime env cannot relabel it.
    DTEKTOR_BUILD_SHA: process.env.DTEKTOR_BUILD_SHA || "unknown",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
