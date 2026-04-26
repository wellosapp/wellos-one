/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Type-safe `<Link href="...">` based on actual route segments.
    typedRoutes: true,
  },
};

export default nextConfig;
