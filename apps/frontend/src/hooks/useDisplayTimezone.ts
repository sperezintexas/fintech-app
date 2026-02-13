"use client";

import { useState, useEffect, useCallback } from "react";
import { formatInTimezone, DEFAULT_DISPLAY_TIMEZONE } from "@/lib/date-format";

type DateTimeFormatOptions = Intl.DateTimeFormatOptions;

type Profile = { displayTimezone: string };

export function useDisplayTimezone(): {
  timezone: string;
  loading: boolean;
  formatDate: (
    date: Date | string | null | undefined,
    options?: DateTimeFormatOptions
  ) => string;
  setTimezone: (tz: string) => Promise<void>;
} {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : { displayTimezone: DEFAULT_DISPLAY_TIMEZONE }))
      .then((data: Profile) => {
        if (!cancelled) setProfile(data);
      })
      .catch(() => {
        if (!cancelled) setProfile({ displayTimezone: DEFAULT_DISPLAY_TIMEZONE });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const timezone = profile?.displayTimezone ?? DEFAULT_DISPLAY_TIMEZONE;

  const formatDate = useCallback(
    (date: Date | string | null | undefined, options?: DateTimeFormatOptions) =>
      formatInTimezone(date, timezone, options ?? { dateStyle: "medium", timeStyle: "short" }),
    [timezone]
  );

  const setTimezone = useCallback(async (tz: string) => {
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayTimezone: tz }),
    });
    if (res.ok) {
      const data = (await res.json()) as Profile;
      setProfile(data);
    }
  }, []);

  return { timezone, loading, formatDate, setTimezone };
}
