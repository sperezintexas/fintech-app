"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { SideNav } from "@/components/SideNav";

export function AppHeader() {
  const pathname = usePathname();
  const [alertCount, setAlertCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetch("/api/alerts?unacknowledged=true&limit=100")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setAlertCount(Array.isArray(data) ? data.length : 0))
      .catch(() => setAlertCount(0));
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <>
      <header data-testid="app-header" className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="p-2 -ml-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Open menu"
                aria-expanded={sidebarOpen}
                title="Menu"
                data-testid="sidebar-menu-button"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <Link href="/" className="flex items-center gap-2 sm:gap-3" title="Home">
                <img
                  src="/icon.svg"
                  alt="myInvestments"
                  width={40}
                  height={40}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl"
                />
                <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-700 bg-clip-text text-transparent">
                  myInvestments
                </h1>
              </Link>
            </div>

            <div className="flex items-center gap-1">
              <Link
                href="/alerts"
                className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Alerts"
                title="Alerts"
              >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {alertCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs min-w-[18px] h-[18px] flex items-center justify-center rounded-full font-medium">
                  {alertCount > 99 ? "99+" : alertCount}
                </span>
              )}
              </Link>
              <Link
                href="/watchlist"
                className={`p-2 rounded-lg transition-colors ${(pathname ?? "").startsWith("/watchlist") ? "bg-blue-50 ring-2 ring-blue-500/30" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}`}
                aria-label="Watchlist"
                title="Watchlist"
              >
                <img src="/watchlist.jpeg" alt="" width={20} height={20} className="w-5 h-5 rounded-full object-cover" />
              </Link>
              <Link
                href="/chat"
                className={`p-2 rounded-lg transition-colors ${(pathname ?? "").startsWith("/chat") ? "bg-blue-50 ring-2 ring-blue-500/30" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}`}
                aria-label="Smart Grok"
                title="Smart Grok"
              >
                <img src="/apple-icon.svg" alt="" width={20} height={20} className="w-5 h-5" />
              </Link>
              <Link
                href="/xstrategybuilder"
                className={`p-2 rounded-lg transition-colors ${(pathname ?? "").startsWith("/xstrategybuilder") ? "bg-blue-50 ring-2 ring-blue-500/30" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}`}
                aria-label="xStrategyBuilder"
                title="xStrategyBuilder"
              >
                <img src="/xstrategybuilder-icon.svg" alt="" width={20} height={20} className="w-5 h-5" />
              </Link>
              <Link
                href="/automation"
                className={`p-2 rounded-lg transition-colors ${(pathname ?? "").startsWith("/automation") ? "text-blue-600 bg-blue-50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}`}
                aria-label="Setup"
                title="Setup"
              >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11.42 15.17l4.655 5.653a2.548 2.548 0 11-3.586 3.586l-6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m6.615 8.206L15.75 15.75M4.867 19.125H.75v-4.125l.879-.879h3.238"
                />
              </svg>
              </Link>
              <div className="w-px h-6 bg-gray-200 mx-1" aria-hidden />
              <UserMenu />
            </div>
          </div>
        </div>
      </header>
      <SideNav open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </>
  );
}

type MongoInfo = {
  connectionDisplay?: string;
  database?: string;
} | null;

function UserMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [mongoInfo, setMongoInfo] = useState<MongoInfo>(null);

  const image = session?.user?.image ?? null;
  const initial = session?.user?.name?.[0] ?? session?.user?.username?.[0] ?? "?";
  const displayName = session?.user?.username ?? session?.user?.name ?? "User";

  useEffect(() => {
    if (!open) return;
    fetch("/api/health")
      .then((res) => (res.ok ? res.json() : {}))
      .then((data: { checks?: { mongodb?: { connectionDisplay?: string; database?: string } } }) => {
        const m = data?.checks?.mongodb;
        setMongoInfo(m ? { connectionDisplay: m.connectionDisplay, database: m.database } : null);
      })
      .catch(() => setMongoInfo(null));
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden bg-gradient-to-br from-gray-700 to-gray-900 text-white text-sm font-medium hover:ring-2 hover:ring-blue-500/50 transition-colors shrink-0"
        aria-label="User menu"
        aria-expanded={open}
        title="User menu"
      >
        {image ? (
          <img
            src={image}
            alt=""
            width={36}
            height={36}
            className="w-full h-full object-cover"
          />
        ) : (
          <span>{initial.toUpperCase()}</span>
        )}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 mt-1 py-1 min-w-[16rem] max-w-[24rem] bg-white rounded-lg shadow-lg border border-gray-200 z-50">
            <div className="px-3 py-2 text-sm text-gray-700 border-b border-gray-100">
              @{displayName}
            </div>
            {mongoInfo && (mongoInfo.connectionDisplay != null || mongoInfo.database != null) && (
              <div className="px-3 py-2 border-b border-gray-100">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                  MongoDB
                </div>
                {mongoInfo.connectionDisplay != null && (
                  <div className="text-xs text-gray-600 font-mono break-all" title="Connection string (password masked)">
                    {mongoInfo.connectionDisplay}
                  </div>
                )}
                {mongoInfo.database != null && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    DB: {mongoInfo.database}
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/contact" })}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
