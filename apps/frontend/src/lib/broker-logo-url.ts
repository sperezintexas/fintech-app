/**
 * Broker logo URLs from disk (public/logos/). Use these everywhere so logos load
 * without hitting the API and avoid path-resolution issues in dev/Docker.
 */
export const BROKER_LOGO_URLS = {
  merrill: "/logos/merrill-logo.png",
  fidelity: "/logos/fidelity-logo.png",
} as const;

export type BrokerTypeName = "Merrill" | "Fidelity";

/** Return static logo URL if broker name contains "merrill" or "fidelity", else null. */
export function getBrokerLogoUrlFromName(name: string | undefined): string | null {
  const key = (name ?? "").trim().toLowerCase();
  if (!key) return null;
  if (key.includes("merrill")) return BROKER_LOGO_URLS.merrill;
  if (key.includes("fidelity")) return BROKER_LOGO_URLS.fidelity;
  return null;
}

/**
 * Return static logo URL for built-in brokers. Prefer brokerType; else use broker name.
 * Returns null for unknown brokers (caller can use API or show initial).
 */
export function getBrokerLogoUrl(
  broker: { name?: string } | null,
  brokerType?: BrokerTypeName | null
): string | null {
  if (brokerType === "Merrill") return BROKER_LOGO_URLS.merrill;
  if (brokerType === "Fidelity") return BROKER_LOGO_URLS.fidelity;
  if (broker?.name) return getBrokerLogoUrlFromName(broker.name);
  return null;
}
