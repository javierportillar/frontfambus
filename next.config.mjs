import withPWAInit from "next-pwa";
import defaultRuntimeCaching from "next-pwa/cache.js";

// API responses are authenticated and tenant-scoped through the X-Tenant
// header. The Cache API key does not include request headers, so Workbox's
// default shared `apis` cache can return stale or another tenant's response
// when the network exceeds its timeout. Keep API data network-only; SWR owns
// the in-memory client cache and refetch lifecycle.
const runtimeCaching = defaultRuntimeCaching.filter(
  (entry) => entry.options?.cacheName !== "apis",
);

runtimeCaching.unshift({
  urlPattern: ({ url }) => self.origin === url.origin && url.pathname.startsWith("/api/"),
  handler: "NetworkOnly",
  method: "GET",
});

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default withPWA(nextConfig);
