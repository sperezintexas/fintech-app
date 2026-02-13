import { readFile } from "fs/promises";
import path from "path";

export const BUILTIN_BROKER_LOGO_FILES: Record<string, string> = {
  merrill: "merrill-logo.png",
  fidelity: "fidelity-logo.png",
};

/** Resolve public/logos path (works when cwd is monorepo root or app root). */
export async function readBrokerLogoFromDisk(file: string): Promise<Buffer | null> {
  const candidates = [
    path.join(process.cwd(), "public", "logos", file),
    path.join(process.cwd(), "apps", "frontend", "public", "logos", file),
  ];
  if (typeof __dirname !== "undefined") {
    candidates.push(path.join(__dirname, "..", "..", "..", "public", "logos", file));
  }
  for (const logoPath of candidates) {
    try {
      return await readFile(logoPath);
    } catch {
      continue;
    }
  }
  return null;
}
