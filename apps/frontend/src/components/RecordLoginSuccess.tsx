"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

/** Calls POST /api/login-history once when session exists so we record a successful login. Cookie prevents duplicate within 30 min. */
export function RecordLoginSuccess() {
  const { data: session, status } = useSession();
  const recorded = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user || recorded.current) return;
    recorded.current = true;
    fetch("/api/login-history", { method: "POST" }).catch(() => {
      recorded.current = false;
    });
  }, [session?.user, status]);

  return null;
}
