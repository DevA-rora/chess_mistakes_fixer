import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.86.36", "172.21.62.183"],
  serverExternalPackages: ["stockfish"],
};

export default nextConfig;
