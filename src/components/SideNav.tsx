"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
};

const SIDE_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", isActive: (p) => p === "/" },
  { href: "/watchlist", label: "Watchlist", isActive: (p) => (p ?? "").startsWith("/watchlist") },
  {
    href: "/holdings",
    label: "Holdings",
    isActive: (p) => (p ?? "").startsWith("/holdings") || (p ?? "").startsWith("/positions"),
  },
  {
    href: "/xstrategybuilder",
    label: "xStrategyBuilder",
    isActive: (p) => (p ?? "").startsWith("/xstrategybuilder"),
  },
  {
    href: "/docs/strategy",
    label: "Investment strategy",
    isActive: (p) => (p ?? "").startsWith("/docs/strategy"),
  },
  {
    href: "/settings/access-keys",
    label: "Access keys",
    isActive: (p) => (p ?? "").startsWith("/settings/access-keys"),
  },
];

type SideNavProps = {
  open: boolean;
  onClose: () => void;
};

export function SideNav({ open, onClose }: SideNavProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 md:bg-black/30 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className={`fixed left-0 top-0 z-50 h-full w-64 max-w-[85vw] border-r border-gray-200 bg-white shadow-xl transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Main navigation"
      >
        <div className="flex h-16 items-center justify-between border-b border-gray-100 px-4">
          <span className="font-semibold text-gray-800">Menu</span>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="flex flex-col gap-0.5 p-3">
          {SIDE_NAV_ITEMS.map((item) => {
            const active = item.isActive(pathname ?? "");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
