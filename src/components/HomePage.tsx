"use client";

import { signIn } from "next-auth/react";
import type { Session } from "next-auth";
import { Dashboard } from "@/components/Dashboard";
import { Footer } from "@/components/Footer";
import { AppHeader } from "@/components/AppHeader";

type Props = { session: Session | null; skipAuth?: boolean };

export function HomePage({ session, skipAuth }: Props) {
  if (!session && !skipAuth) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-8">
            myInvestments
          </h1>
          <button
            type="button"
            onClick={() => signIn("twitter", { callbackUrl: "/" })}
            className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-black text-white hover:bg-gray-800 transition-colors"
            aria-label="Sign in with X"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-12 h-12"
              fill="currentColor"
              aria-hidden
            >
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </button>
          <p className="mt-4 text-sm text-gray-500">Sign in with X</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900">
            Good afternoon, Sam
          </h2>
          <p className="text-gray-600 mt-1">
            Here&apos;s how your portfolio is performing today.
          </p>
        </div>

        <Dashboard />
      </main>

      <Footer />
    </div>
  );
}
