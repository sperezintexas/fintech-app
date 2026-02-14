"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function AutomationNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  const isBase = pathname === "/automation";
  const isPortfolio = pathname === "/automation/portfolio";
  const isScheduler = pathname === "/automation/scheduler";
  const isTaskHistory = pathname === "/automation/task-history";
  const isTaskTypes = pathname === "/automation/task-types";
  const isLoginHistory = pathname === "/automation/login-history";
  const isXTools = pathname === "/automation/xtools";
  const isCalculators = pathname === "/automation/calculators";
  const isGoals = pathname === "/automation/goals";

  const activeSeparation = isBase && tabParam === "separation";
  const activeAuth = isBase && tabParam !== "settings" && tabParam !== "strategy" && tabParam !== "tasks" && tabParam !== "separation" && tabParam !== "chat" && tabParam !== "brokers";
  const activeSettings = isBase && tabParam === "settings";
  const activeStrategy = isBase && tabParam === "strategy";
  const activeChat = isBase && tabParam === "chat";
  const activeBrokers = isBase && tabParam === "brokers";
  const activeTasks = isScheduler || (isBase && tabParam === "tasks");

  return (
    <nav className="flex flex-wrap gap-4 border-b border-gray-200 mb-6">
      <Link
        href="/automation/portfolio"
        className={`py-3 px-1 border-b-2 font-medium text-sm ${
          isPortfolio ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
        }`}
      >
        Portfolio
      </Link>
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
        href="/automation?tab=chat"
        className={`py-3 px-1 border-b-2 font-medium text-sm ${
          activeChat ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
        }`}
      >
        AI Chat
      </Link>
      <Link
        href="/automation?tab=brokers"
        className={`py-3 px-1 border-b-2 font-medium text-sm ${
          activeBrokers ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
        }`}
      >
        Brokers
      </Link>
      <Link
        href="/automation/goals"
        className={`py-3 px-1 border-b-2 font-medium text-sm ${
          isGoals ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
        }`}
      >
        Goals
      </Link>
      <Link
        href="/automation/scheduler"
        className={`py-3 px-1 border-b-2 font-medium text-sm ${
          activeTasks ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
        }`}
      >
        Scheduled Tasks
      </Link>
      <Link
        href="/automation/task-history"
        className={`py-3 px-1 border-b-2 font-medium text-sm ${
          isTaskHistory ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
        }`}
      >
        Task History
      </Link>
      <Link
        href="/automation/task-types"
        className={`py-3 px-1 border-b-2 font-medium text-sm ${
          isTaskTypes ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
        }`}
      >
        Task Types
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
      <Link
        href="/automation/calculators"
        className={`py-3 px-1 border-b-2 font-medium text-sm ${
          isCalculators ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
        }`}
      >
        Calculators
      </Link>
    </nav>
  );
}
