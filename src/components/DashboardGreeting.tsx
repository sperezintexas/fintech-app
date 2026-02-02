"use client";

type Props = { displayName: string };

export function DashboardGreeting({ displayName }: Props) {
  return (
    <div className="mb-3 sm:mb-4">
      <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl truncate" style={{ wordBreak: "keep-all" }}>
        Hello, {displayName}
      </h1>
    </div>
  );
}
