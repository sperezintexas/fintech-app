"use client";

import type { AlertDeliveryChannel } from "@/types/portfolio";

type JobType = {
  _id: string;
  id: string;
  handlerKey: string;
  name: string;
  description: string;
  supportsPortfolio: boolean;
  supportsAccount: boolean;
  order: number;
  enabled: boolean;
  defaultConfig?: Record<string, unknown>;
  defaultDeliveryChannels?: AlertDeliveryChannel[];
};


type JobTypeListProps = {
  jobTypes: JobType[];
  onEdit: (jobType: JobType) => void;
  onDelete: (id: string) => void;
  onToggleEnabled: (jobType: JobType) => void;
  isDeleting?: string;
  isToggling?: string;
};

export function JobTypeList({
  jobTypes,
  onEdit,
  onDelete,
  onToggleEnabled,
  isDeleting,
  isToggling,
}: JobTypeListProps) {
  if (jobTypes.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-2xl">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
        <h3 className="mt-4 text-lg font-medium text-gray-900">No job types yet</h3>
        <p className="mt-2 text-gray-500">Create job types to use in scheduled jobs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {jobTypes.map((jt) => (
        <div
          key={jt._id}
          className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-shadow ${
            jt.enabled ? "border-gray-100" : "border-gray-200 bg-gray-50/50"
          }`}
        >
          <div className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-900">{jt.name}</h3>
                  {!jt.enabled && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
                      Disabled
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-0.5 font-mono">{jt.id}</p>
                {jt.description && (
                  <p className="text-sm text-gray-600 mt-1">{jt.description}</p>
                )}
                <div className="flex flex-wrap gap-2 mt-2">
                  {jt.supportsPortfolio && (
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                      Portfolio
                    </span>
                  )}
                  {jt.supportsAccount && (
                    <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">
                      Account
                    </span>
                  )}
                  {jt.defaultDeliveryChannels && jt.defaultDeliveryChannels.length > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-700" title="Default channels">
                      Channels: {jt.defaultDeliveryChannels.join(", ")}
                    </span>
                  )}
                  {jt.defaultConfig && Object.keys(jt.defaultConfig).length > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700" title="Default config">
                      Config: {Object.entries(jt.defaultConfig)
                        .filter(([, v]) => v != null && v !== "")
                        .map(([k, v]) => `${k}: ${Array.isArray(v) ? (v as string[]).join(",") : v}`)
                        .slice(0, 3)
                        .join(" · ")}
                      {Object.keys(jt.defaultConfig).length > 3 ? "…" : ""}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6 pt-4 border-t border-gray-100">
              <button
                onClick={() => onToggleEnabled(jt)}
                disabled={!!isToggling}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
                  jt.enabled
                    ? "text-amber-600 bg-amber-50 hover:bg-amber-100"
                    : "text-green-600 bg-green-50 hover:bg-green-100"
                }`}
              >
                {isToggling === jt._id ? (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Updating...
                  </span>
                ) : jt.enabled ? (
                  "Disable"
                ) : (
                  "Enable"
                )}
              </button>
              <button
                onClick={() => onEdit(jt)}
                className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => onDelete(jt._id)}
                disabled={isDeleting === jt._id}
                className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                {isDeleting === jt._id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
