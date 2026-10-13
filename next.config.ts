import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
