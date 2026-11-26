import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  deploymentId:
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_DEPLOYMENT_ID ||
    process.env.GIT_COMMIT_SHA ||
    undefined,
  cacheComponents: true,
  partialPrefetching: true,
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        condition: {
          path: /(?:^|\/)(?:globals|super-admin|subscriptions)\.css$/,
        },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
