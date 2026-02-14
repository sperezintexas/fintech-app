"use client";

import { useState, useEffect } from "react";

type GoalProgress = {
  oneMillionBy2030Percent?: number;
  goalLabel?: string;
  updatedAt?: string;
};

export function GoalProbabilityCard() {
  const [data, setData] = useState<GoalProgress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/goal-progress", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: GoalProgress | null) => {
        if (!cancelled && json) setData(json);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || data?.oneMillionBy2030Percent == null) return null;

  const percent = data.oneMillionBy2030Percent;
  const updatedAt = data.updatedAt
    ? new Date(data.updatedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  const band =
    percent >= 70 ? "high" : percent >= 40 ? "medium" : "low";
  const bgClass =
    band === "high"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : band === "medium"
        ? "bg-amber-50 border-amber-200 text-amber-800"
        : "bg-gray-50 border-gray-200 text-gray-800";

  return (
    <div
      className={`mb-4 sm:mb-6 w-full rounded-xl border px-4 py-3 shadow-sm sm:px-5 sm:py-4 ${bgClass}`}
      aria-label="Goal progress"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-base font-medium sm:text-lg">
          <span className="font-semibold">{percent}%</span>
          {" "}
          probability of reaching {data.goalLabel ?? "$10M by 2030"}
        </p>
        {updatedAt && (
          <p className="text-xs opacity-80 sm:text-sm">
            Updated {updatedAt}
          </p>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-600 sm:text-sm">
        Recalculated daily when the risk scanner runs.
      </p>
    </div>
  );
}
