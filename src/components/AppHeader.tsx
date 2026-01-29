"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
};

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", isActive: (p) => p === "/" },
  { href: "/accounts", label: "Accounts", isActive: (p) => p.startsWith("/accounts") },
  { href: "/holdings", label: "Holdings", isActive: (p) => p.startsWith("/holdings") || p.startsWith("/positions") },
  { href: "/find-profits", label: "xAIProfitBuilder", isActive: (p) => p.startsWith("/find-profits") },
  { href: "/automation", label: "Setup", isActive: (p) => p.startsWith("/automation") },
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              <img
                src="/icon.svg"
                alt="myInvestments"
                width={40}
                height={40}
                className="w-10 h-10 rounded-xl"
              />
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-700 bg-clip-text text-transparent">
                myInvestments
              </h1>
            </Link>
          </div>

          <nav className="hidden md:flex items-center gap-6">
            {NAV.map((item) => {
              const active = item.isActive(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? "text-gray-800 font-medium hover:text-blue-600" : "text-gray-500 hover:text-blue-600"}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-4">
            <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg" aria-label="Notifications">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            </button>
            <div className="w-9 h-9 bg-gradient-to-br from-gray-700 to-gray-900 rounded-full flex items-center justify-center text-white text-sm font-medium">
              SP
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
