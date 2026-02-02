"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { APP_VERSION } from "@/lib/version";

export function Footer() {
  const [currentTime, setCurrentTime] = useState<string>("");

  useEffect(() => {
    // Set initial time
    setCurrentTime(new Date().toLocaleString());

    // Update every minute
    const interval = setInterval(() => {
      setCurrentTime(new Date().toLocaleString());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  return (
    <footer className="mt-16 border-t border-gray-200 bg-white/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-sm text-gray-500">
              © 2026 myInvestments. All rights reserved.
            </p>
            <Link
              href="/docs/strategy"
              className="text-sm text-gray-600 hover:text-gray-900 underline underline-offset-2 transition-colors"
            >
              Investment strategy
            </Link>
            <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full font-mono">
              v{APP_VERSION}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span>{currentTime}</span>
            <span>•</span>
            <span>Market data by Polygon.io</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
