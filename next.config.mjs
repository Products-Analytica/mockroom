/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict mode mounts components twice in development, which would start the interview engine twice.
  reactStrictMode: false
};
export default nextConfig;
