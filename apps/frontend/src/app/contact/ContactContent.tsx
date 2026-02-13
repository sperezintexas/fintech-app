"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import loginBg from "@/app/back1.jpeg";

type Props = {
  accessDenied: boolean;
  authError?: string;
  calendlyUrl: string;
  callbackUrl: string;
};

export function ContactContent({
  accessDenied,
  authError,
  calendlyUrl,
  callbackUrl,
}: Props) {
  const [key, setKey] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<"key" | "password" | null>(null);
  const [error, setError] = useState("");

  const handleKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading("key");
    try {
      const res = await signIn("credentials", {
        key: key.trim(),
        callbackUrl,
        redirect: false,
      });
      if (res?.error) {
        setError("Invalid access key.");
        setLoading(null);
        return;
      }
      if (res?.url) window.location.href = res.url;
    } finally {
      setLoading(null);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading("password");
    try {
      const res = await signIn("credentials", {
        email: email.trim(),
        password,
        callbackUrl,
        redirect: false,
      });
      if (res?.error) {
        setError("Invalid email or password.");
        setLoading(null);
        return;
      }
      if (res?.url) window.location.href = res.url;
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat -z-10"
        style={{ backgroundImage: `url(${loginBg.src})` }}
        aria-hidden
      />
      <div className="text-center max-w-md rounded-xl bg-white/90 px-6 py-8 shadow-lg">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          xAI powered myInvestments
        </h1>
        {accessDenied ? (
          <div className="text-gray-600 mb-6 space-y-2">
            <p>You don't have access yet. Schedule a time below to get in touch.</p>
            {authError === "CredentialsSignin" && (
              <p className="text-sm text-amber-800 bg-amber-50/90 rounded-lg px-3 py-2 text-left">
                Invalid access key or email/password. The <strong>Access key</strong> field is not for your X password — use the <strong>Sign in with X</strong> button, or paste a key from Setup → Access keys.
              </p>
            )}
            <p className="text-sm text-amber-800 bg-amber-50/90 rounded-lg px-3 py-2 text-left">
              If you used <strong>Sign in with X</strong>: (1) Your X username must be on the allowed list (Setup → Auth Users). (2) In the{" "}
              <a href="https://developer.x.com/en/docs/projects/overview" target="_blank" rel="noopener noreferrer" className="underline">X Developer Portal</a>, ensure your app is <strong>attached to a Project</strong> and add the callback URL <code className="bg-white/80 px-1 rounded text-xs">http://localhost:3000/api/auth/callback/twitter</code>.
            </p>
            <ul className="text-sm text-amber-800 bg-amber-50/90 rounded-lg px-3 py-2 text-left list-disc list-inside space-y-1 font-mono text-xs break-all">
              <li>Local: <code className="bg-white/80 px-1 rounded">http://localhost:3000/api/auth/callback/twitter</code></li>
              <li>Production: <code className="bg-white/80 px-1 rounded">https://fzece27dg2.us-east-1.awsapprunner.com/api/auth/callback/twitter</code></li>
            </ul>
          </div>
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

          <form onSubmit={handleKeySubmit} className="flex flex-col gap-2">
            <label htmlFor="access-key" className="text-left text-sm font-medium text-gray-700">
              Or sign in with access key
            </label>
            <input
              id="access-key"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Paste your access key"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={loading === "key" || !key.trim()}
              className="py-2 rounded-lg bg-gray-700 text-white hover:bg-gray-600 disabled:opacity-50 font-medium"
            >
              {loading === "key" ? "Signing in…" : "Sign in with key"}
            </button>
          </form>

          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-2 pt-2 border-t border-gray-200">
            <label className="text-left text-sm font-medium text-gray-700">
              Or sign in with email & password
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
              autoComplete="email"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
              autoComplete="current-password"
            />
            <button
              type="submit"
              disabled={loading === "password" || !email.trim() || !password}
              className="py-2 rounded-lg bg-gray-700 text-white hover:bg-gray-600 disabled:opacity-50 font-medium"
            >
              {loading === "password" ? "Signing in…" : "Sign in with password"}
            </button>
          </form>

          {error && <p className="text-sm text-red-600">{error}</p>}

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
