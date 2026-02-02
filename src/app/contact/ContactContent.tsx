"use client";

import { signIn } from "next-auth/react";

type Props = {
  accessDenied: boolean;
  calendlyUrl: string;
  callbackUrl: string;
};

export function ContactContent({
  accessDenied,
  calendlyUrl,
  callbackUrl,
}: Props) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url(/back1.jpeg)" }}
    >
      <div className="text-center max-w-md rounded-xl bg-white/90 px-6 py-8 shadow-lg">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          myInvestments
        </h1>
        {accessDenied ? (
          <p className="text-gray-600 mb-6">
            You don’t have access yet. Schedule a time below to get in touch.
          </p>
        ) : (
          <p className="text-gray-600 mb-6">
            Sign in if you have access, or schedule a time to connect.
          </p>
        )}

        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => signIn("twitter", { callbackUrl })}
            className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-black text-white hover:bg-gray-800 transition-colors font-medium"
            aria-label="Sign in with X"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5"
              fill="currentColor"
              aria-hidden
            >
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Sign in with X
          </button>

          <a
            href={calendlyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-lg border-2 border-gray-300 text-gray-700 hover:border-gray-500 hover:bg-gray-100 transition-colors font-medium"
          >
            Schedule time with me
          </a>
        </div>
      </div>
    </div>
  );
}
