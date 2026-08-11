import type { NextConfig } from "next";

const backendInternalURL = (process.env.BACKEND_INTERNAL_URL || "http://localhost:4000").replace(/\/$/, "");
const driveInternalURL = (process.env.DRIVE_INTERNAL_URL || "http://localhost:4001").replace(/\/$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  poweredByHeader: false,
  // Rewrites proxy through Next's own fetch, which gives up after 30s by
  // default and answers 500. Every AI agent call goes through this path, and a
  // tool-using agent on a local model routinely needs longer than that — so the
  // browser reported "an error occurred while connecting to the AI" for requests
  // the backend was still answering successfully (measured: 43s, HTTP 200).
  // The limit sits above the sidecar's own ceiling so a real timeout surfaces as
  // the sidecar's message rather than an opaque 500 from the proxy.
  experimental: {
    proxyTimeout: 300_000,
  },
  // Keep Turbopack scoped to this app when another lockfile exists above it.
  turbopack: {
    root: process.cwd(),
  },
  // Keep browser traffic same-origin. Besides avoiding a permissive CORS
  // dependency, this is what lets the HttpOnly session cookie work consistently
  // when the development UI is served on :3000 and its services use other ports.
  async rewrites() {
    return [
      // Drive metadata belongs to backend-core. Keep this exact route before
      // the storage-service wildcard, otherwise the list request reaches
      // septimus-drive (which only owns upload/download) and returns 404.
      {
        source: "/api/v1/drive/files",
        destination: `${backendInternalURL}/api/v1/drive/files`,
      },
      {
        source: "/api/v1/drive/:path*",
        destination: `${driveInternalURL}/api/v1/drive/:path*`,
      },
      {
        source: "/api/v1/:path*",
        destination: `${backendInternalURL}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
