import path from "node:path";

import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// Single .env at the repo root, shared with the analyzer.
loadEnv({ path: path.resolve(__dirname, "../../.env"), quiet: true });

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
};

export default nextConfig;
