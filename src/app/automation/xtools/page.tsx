"use client";

import { XToolsConsole } from "@/components/XToolsConsole";

export default function XToolsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">xTools Console</h2>
        <p className="text-gray-600 mt-1">
          Run queries and cleanup statements on app collections (read and delete/update).
        </p>
      </div>
      <XToolsConsole />
    </div>
  );
}
