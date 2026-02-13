// Version from package.json via next.config env (single source of truth)
export const APP_VERSION =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_APP_VERSION) || "0.0.0";

// Build timestamp (set at build time)
export const BUILD_TIME = new Date().toISOString();
