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

function truncate(s: string, len: number) {
  if (s.length <= len) return s;
  return s.slice(0, len) + "…";
}

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
      <div className="text-center py-12 bg-gray-50 rounded-xl">
        <svg className="mx-auto h-10 w-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <h3 className="mt-3 text-base font-medium text-gray-900">No job types yet</h3>
        <p className="mt-1 text-sm text-gray-500">Create job types to use in scheduled jobs.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs sm:text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 px-1.5 font-medium text-gray-600">Name</th>
            <th className="text-left py-2 px-1.5 font-medium text-gray-600">ID</th>
            <th className="text-left py-2 px-1.5 font-medium text-gray-600">Description</th>
            <th className="text-center py-2 px-1.5 font-medium text-gray-600">Scope</th>
            <th className="text-center py-2 px-1.5 font-medium text-gray-600">Status</th>
            <th className="text-center py-2 px-1.5 font-medium text-gray-600 w-24">Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobTypes.map((jt) => (
            <tr
              key={jt._id}
              className={`border-b border-gray-100 hover:bg-gray-50 ${!jt.enabled ? "bg-gray-50/50" : ""}`}
            >
              <td className="py-2 px-1.5">
                <span className="font-medium text-gray-900">{jt.name}</span>
              </td>
              <td className="py-2 px-1.5 font-mono text-gray-500">{jt.id}</td>
              <td className="py-2 px-1.5 text-gray-600 max-w-[200px]" title={jt.description || undefined}>
                {jt.description ? truncate(jt.description, 50) : "—"}
              </td>
              <td className="py-2 px-1.5 text-center">
                <span className="inline-flex gap-0.5">
                  {jt.supportsPortfolio && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700" title="Portfolio">P</span>
                  )}
                  {jt.supportsAccount && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700" title="Account">A</span>
                  )}
                  {!jt.supportsPortfolio && !jt.supportsAccount && "—"}
                </span>
              </td>
              <td className="py-2 px-1.5 text-center">
                <button
                  onClick={() => onToggleEnabled(jt)}
                  disabled={!!isToggling}
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium disabled:opacity-50 flex items-center justify-center min-w-[28px] ${
                    jt.enabled ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                  }`}
                  title={jt.enabled ? "Disable" : "Enable"}
                >
                  {isToggling === jt._id ? (
                    <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : jt.enabled ? (
                    "On"
                  ) : (
                    "Off"
                  )}
                </button>
              </td>
              <td className="py-2 px-1.5">
                <div className="flex items-center justify-center gap-0.5">
                  <button
                    onClick={() => onEdit(jt)}
                    className="p-1 text-gray-400 hover:text-blue-600 rounded"
                    title="Edit"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onDelete(jt._id)}
                    disabled={isDeleting === jt._id}
                    className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-50 rounded"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
