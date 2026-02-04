"use client";

import { useState } from "react";
import type { Position } from "@/types/portfolio";

export type BtcOrderType = "market" | "limit";

type BuyToCloseModalProps = {
  position: Position;
  accountId: string;
  onClose: () => void;
  onSuccess: () => void;
};

function formatOptionLabel(position: Position): string {
  if (position.type !== "option" || !position.ticker) return position.ticker ?? "";
  const u = position.ticker.toUpperCase();
  const exp = position.expiration
    ? new Date(position.expiration).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })
    : "";
  const type = position.optionType === "put" ? "P" : "C";
  const strike = position.strike != null ? position.strike : "";
  return `${u} ${exp} ${type} $${strike}`;
}

export function BuyToCloseModal({
  position,
  accountId,
  onClose,
  onSuccess,
}: BuyToCloseModalProps) {
  const contracts = position.contracts ?? 0;
  const currentPremium = position.currentPrice ?? position.premium ?? 0;
  const [quantity, setQuantity] = useState<number>(contracts);
  const [orderType, setOrderType] = useState<BtcOrderType>("market");
  const [limitPrice, setLimitPrice] = useState<string>(
    currentPremium > 0 ? currentPremium.toFixed(2) : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quantityValid = quantity >= 1 && quantity <= contracts;
  const limitValid =
    orderType !== "limit" || (limitPrice !== "" && !Number.isNaN(Number(limitPrice)) && Number(limitPrice) > 0);
  const canSubmit = quantityValid && limitValid;

  const estimatedCost = quantity * currentPremium * 100;
  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    const pricePerContract = orderType === "limit" && limitPrice ? Number(limitPrice) : currentPremium;
    try {
      const res = await fetch(`/api/positions/${position._id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          quantity,
          orderType,
          pricePerContract,
          ...(orderType === "limit" && limitPrice ? { limitPrice: Number(limitPrice) } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to close position");
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close position");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="btc-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100">
          <h2 id="btc-modal-title" className="text-xl font-bold text-gray-900">
            Buy to Close
          </h2>
          <p className="mt-1 text-sm text-gray-600 font-medium">
            {formatOptionLabel(position)}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Position: {contracts} contract{contracts !== 1 ? "s" : ""} · Last: {formatCurrency(currentPremium)}/contract
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label htmlFor="btc-quantity" className="block text-sm font-medium text-gray-700 mb-1">
              Quantity
            </label>
            <input
              id="btc-quantity"
              type="number"
              min={1}
              max={contracts}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">Max: {contracts} contract{contracts !== 1 ? "s" : ""}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Order type
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="orderType"
                  value="market"
                  checked={orderType === "market"}
                  onChange={() => setOrderType("market")}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Market</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="orderType"
                  value="limit"
                  checked={orderType === "limit"}
                  onChange={() => setOrderType("limit")}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Limit</span>
              </label>
            </div>
            {orderType === "limit" && (
              <div className="mt-2">
                <label htmlFor="btc-limit-price" className="sr-only">Limit price per contract</label>
                <input
                  id="btc-limit-price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Limit price"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  className="w-full max-w-[140px] px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <span className="ml-2 text-sm text-gray-500">per contract</span>
              </div>
            )}
          </div>

          {quantityValid && (
            <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-700">
              <strong>Est. cost to close:</strong> {formatCurrency(estimatedCost)}
              <span className="text-gray-500 ml-1">
                ({quantity} × {formatCurrency(currentPremium)} × 100)
              </span>
            </div>
          )}

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-2">
            <p className="font-semibold">Before you close</p>
            <ul className="list-disc list-inside space-y-1 text-amber-800">
              <li>
                <strong>Timing:</strong> To avoid assignment, close the position before market close on the expiration
                day (or earlier if necessary).
              </li>
              <li>
                <strong>Cost:</strong> The cost to buy to close may exceed the premium you initially collected if the
                market moved against you.
              </li>
              <li>
                <strong>Outcome:</strong> Once executed, the contract is removed from your portfolio, eliminating the
                obligation to buy or sell the underlying.
              </li>
            </ul>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting…" : "Submit buy to close"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
