import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.86.36"],
  serverExternalPackages: ["stockfish"],
};

export default nextConfig;
