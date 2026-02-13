import type { NextConfig } from "next";
import path from "path";
import { readFileSync, existsSync } from "fs";
import packageJson from "./package.json";

// Load repo root .env.local so one file (root) can drive both frontend and backend (dev/local only; not present in Docker)
try {
  const rootEnvPath = path.resolve(__dirname, "../../.env.local");
  if (existsSync(rootEnvPath)) {
    const content = readFileSync(rootEnvPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1).replace(/\\(.)/g, "$1");
      }
      if (key && !process.env[key]) process.env[key] = value;
    }
  }
} catch {
  // ignore (e.g. missing file or permission in container)
}

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
};

export default nextConfig;
