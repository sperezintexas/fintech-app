"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function AutomationNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  const isBase = pathname === "/automation";
  const isScheduler = pathname === "/automation/scheduler";
  const isJobHistory = pathname === "/automation/job-history";
  const isJobTypes = pathname === "/automation/job-types";
  const isLoginHistory = pathname === "/automation/login-history";
  const isXTools = pathname === "/automation/xtools";

  const activeSeparation = isBase && tabParam === "separation";
  const activeAuth = isBase && tabParam !== "settings" && tabParam !== "strategy" && tabParam !== "jobs" && tabParam !== "separation";
  const activeSettings = isBase && tabParam === "settings";
  const activeStrategy = isBase && tabParam === "strategy";
  const activeJobs = isScheduler || (isBase && tabParam === "jobs");

  return (
    <nav className="flex flex-wrap gap-4 border-b border-gray-200 mb-6">
      <Link
        href="/automation?tab=separation"
        className={`py-3 px-1 border-b-2 font-medium text-sm ${
          activeSeparation ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
        }`}
      >
        Import From Broker
      </Link>
      <Link
        href="/automation?tab=auth-users"
        className={`py-3 px-1 border-b-2 font-medium text-sm ${
          activeAuth ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
        }`}
      >
        Auth Users
      </Link>
      <Link
        href="/automation?tab=settings"
        className={`py-3 px-1 border-b-2 font-medium text-sm ${
          activeSettings ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
        }`}
      >
        Alert Settings
      </Link>
      <Link
        href="/automation?tab=strategy"
        className={`py-3 px-1 border-b-2 font-medium text-sm ${
          activeStrategy ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
        }`}
      >
        Strategy
      </Link>
      <Link
        href="/automation/scheduler"
        className={`py-3 px-1 border-b-2 font-medium text-sm ${
          activeJobs ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
        }`}
      >
        Scheduled Jobs
      </Link>
      <Link
        href="/automation/job-history"
        className={`py-3 px-1 border-b-2 font-medium text-sm ${
          isJobHistory ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
        }`}
      >
        Job run history
      </Link>
      <Link
        href="/automation/job-types"
        className={`py-3 px-1 border-b-2 font-medium text-sm ${
          isJobTypes ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
        }`}
      >
        Job types
      </Link>
      <Link
        href="/automation/login-history"
        className={`py-3 px-1 border-b-2 font-medium text-sm ${
          isLoginHistory ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
        }`}
      >
        Login history
      </Link>
      <Link
        href="/automation/xtools"
        className={`py-3 px-1 border-b-2 font-medium text-sm ${
          isXTools ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
        }`}
      >
        xTools Console
      </Link>
    </nav>
  );
}
