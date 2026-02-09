/**
 * Format option premium (per-share) with 4 decimal places, e.g. $0.0650.
 * Use for display wherever option premium is shown.
 */
export function formatOptionPremium(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);
}
