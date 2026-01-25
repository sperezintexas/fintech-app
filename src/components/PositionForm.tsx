"use client";

import { useState, useEffect } from "react";
import { Position, PositionType, OptionType } from "@/types/portfolio";

// Parse Yahoo Finance option symbol format: TSLA260320C00005000
// Format: TICKER + YYMMDD + C/P + 8-digit strike (price * 1000)
function parseYahooOptionSymbol(symbol: string): {
  ticker: string;
  expiration: string;
  optionType: OptionType;
  strike: number;
} | null {
  // Match pattern: letters + 6 digits + C/P + 8 digits
  const match = symbol.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/i);
  if (!match) return null;

  const [, tickerPart, datePart, typePart, strikePart] = match;

  // Parse date: YYMMDD -> YYYY-MM-DD
  const year = 2000 + parseInt(datePart.substring(0, 2));
  const month = datePart.substring(2, 4);
  const day = datePart.substring(4, 6);
  const expiration = `${year}-${month}-${day}`;

  // Parse strike: 8 digits where first 5 are dollars, last 3 are decimal
  const strikeValue = parseInt(strikePart) / 1000;

  return {
    ticker: tickerPart.toUpperCase(),
    expiration,
    optionType: typePart.toUpperCase() === "C" ? "call" : "put",
    strike: strikeValue,
  };
}

type PositionFormProps = {
  position?: Position;
  accountId: string;
  onSubmit: (position: Partial<Position> & { accountId: string }) => void;
  onCancel: () => void;
};

export function PositionForm({
  position,
  accountId,
  onSubmit,
  onCancel,
}: PositionFormProps) {
  const [type, setType] = useState<PositionType>(position?.type || "stock");
  const [ticker, setTicker] = useState(position?.ticker || "");
  const [shares, setShares] = useState(position?.shares?.toString() || "");
  const [purchasePrice, setPurchasePrice] = useState(
    position?.purchasePrice?.toString() || ""
  );
  // Option fields
  const [optionType, setOptionType] = useState<OptionType>(
    position?.optionType || "call"
  );
  const [strike, setStrike] = useState(position?.strike?.toString() || "");
  const [expiration, setExpiration] = useState(position?.expiration || "");
  const [contracts, setContracts] = useState(
    position?.contracts?.toString() || ""
  );
  const [premium, setPremium] = useState(position?.premium?.toString() || "");
  // Yahoo symbol input
  const [yahooSymbol, setYahooSymbol] = useState("");
  const [parseError, setParseError] = useState("");

  const handleParseYahooSymbol = () => {
    const parsed = parseYahooOptionSymbol(yahooSymbol.trim());
    if (parsed) {
      setTicker(parsed.ticker);
      setExpiration(parsed.expiration);
      setOptionType(parsed.optionType);
      setStrike(parsed.strike.toString());
      setParseError("");
      setYahooSymbol("");
    } else {
      setParseError("Invalid format. Expected: TSLA260320C00005000");
    }
  };

  useEffect(() => {
    if (position) {
      setType(position.type);
      setTicker(position.ticker || "");
      setShares(position.shares?.toString() || "");
      setPurchasePrice(position.purchasePrice?.toString() || "");
      setOptionType(position.optionType || "call");
      setStrike(position.strike?.toString() || "");
      setExpiration(position.expiration || "");
      setContracts(position.contracts?.toString() || "");
      setPremium(position.premium?.toString() || "");
    }
  }, [position]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const basePosition = {
      accountId,
      type,
      ticker: ticker.toUpperCase(),
    };

    if (type === "stock") {
      onSubmit({
        ...basePosition,
        shares: parseFloat(shares),
        purchasePrice: parseFloat(purchasePrice),
      });
    } else if (type === "option") {
      onSubmit({
        ...basePosition,
        optionType,
        strike: parseFloat(strike),
        expiration,
        contracts: parseInt(contracts),
        premium: parseFloat(premium),
      });
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6"
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        {position ? "Edit Position" : "Add New Position"}
      </h3>

      {/* Position Type Toggle */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Position Type
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setType("stock")}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
              type === "stock"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Stock
          </button>
          <button
            type="button"
            onClick={() => setType("option")}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
              type === "option"
                ? "bg-purple-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Option
          </button>
        </div>
      </div>

      {/* Ticker Symbol */}
      <div className="mb-4">
        <label
          htmlFor="ticker"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Ticker Symbol
        </label>
        <input
          type="text"
          id="ticker"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="e.g., AAPL"
          required
        />
      </div>

      {type === "stock" ? (
        <>
          {/* Shares */}
          <div className="mb-4">
            <label
              htmlFor="shares"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Number of Shares
            </label>
            <input
              type="number"
              id="shares"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., 100"
              step="0.001"
              required
            />
          </div>

          {/* Purchase Price */}
          <div className="mb-4">
            <label
              htmlFor="purchasePrice"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Purchase Price (per share)
            </label>
            <input
              type="number"
              id="purchasePrice"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., 150.00"
              step="0.01"
              required
            />
          </div>
        </>
      ) : (
        <>
          {/* Yahoo Symbol Parser */}
          <div className="mb-4 p-4 bg-purple-50 rounded-lg border border-purple-100">
            <label
              htmlFor="yahooSymbol"
              className="block text-sm font-medium text-purple-700 mb-1"
            >
              Quick Import from Yahoo Finance Symbol
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                id="yahooSymbol"
                value={yahooSymbol}
                onChange={(e) => {
                  setYahooSymbol(e.target.value.toUpperCase());
                  setParseError("");
                }}
                className="flex-1 px-4 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                placeholder="e.g., TSLA260320C00005000"
              />
              <button
                type="button"
                onClick={handleParseYahooSymbol}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors whitespace-nowrap"
              >
                Parse
              </button>
            </div>
            {parseError && (
              <p className="text-red-500 text-sm mt-1">{parseError}</p>
            )}
            <p className="text-xs text-purple-600 mt-1">
              Format: TICKER + YYMMDD + C/P + Strike (e.g., TSLA260320C00420000 = TSLA $420 Call exp 3/20/26)
            </p>
          </div>

          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">or enter manually</span>
            </div>
          </div>

          {/* Option Type */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Option Type
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOptionType("call")}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                  optionType === "call"
                    ? "bg-green-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                Call
              </button>
              <button
                type="button"
                onClick={() => setOptionType("put")}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                  optionType === "put"
                    ? "bg-red-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                Put
              </button>
            </div>
          </div>

          {/* Strike Price */}
          <div className="mb-4">
            <label
              htmlFor="strike"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Strike Price
            </label>
            <input
              type="number"
              id="strike"
              value={strike}
              onChange={(e) => setStrike(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., 155.00"
              step="0.01"
              required
            />
          </div>

          {/* Expiration Date */}
          <div className="mb-4">
            <label
              htmlFor="expiration"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Expiration Date
            </label>
            <input
              type="date"
              id="expiration"
              value={expiration}
              onChange={(e) => setExpiration(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {/* Contracts */}
          <div className="mb-4">
            <label
              htmlFor="contracts"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Number of Contracts
            </label>
            <input
              type="number"
              id="contracts"
              value={contracts}
              onChange={(e) => setContracts(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., 1"
              min="1"
              required
            />
          </div>

          {/* Premium */}
          <div className="mb-4">
            <label
              htmlFor="premium"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Premium (per contract)
            </label>
            <input
              type="number"
              id="premium"
              value={premium}
              onChange={(e) => setPremium(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., 2.50"
              step="0.01"
              required
            />
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex gap-3 mt-6">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {position ? "Update Position" : "Add Position"}
        </button>
      </div>
    </form>
  );
}
