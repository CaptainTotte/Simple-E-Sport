/** @type {import('next').NextConfig} */
const isProduction = process.env.NODE_ENV === "production";

const nextConfig = {
  distDir: isProduction ? ".next-prod" : ".next-dev",
  webpack: (config, { dev }) => {
    if (dev) {
      // Docker bind mounts can make webpack's FS cache unstable in dev.
      config.cache = false;
    }
    return config;
  }
};

export default nextConfig;
