"use client";

import { useState } from "react";
import { REPORT_HANDLER_KEYS } from "@/lib/report-type-constants";

export type JobTypeFormData = {
  id: string;
  handlerKey: string;
  name: string;
  description: string;
  supportsPortfolio: boolean;
  supportsAccount: boolean;
  order: number;
  enabled: boolean;
};

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
};

type JobTypeFormProps = {
  jobType?: JobType;
  onSubmit: (data: JobTypeFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
};

export function JobTypeForm({ jobType, onSubmit, onCancel, isLoading }: JobTypeFormProps) {
  const [formData, setFormData] = useState<JobTypeFormData>({
    id: jobType?.id ?? "",
    handlerKey: jobType?.handlerKey ?? REPORT_HANDLER_KEYS[0],
    name: jobType?.name ?? "",
    description: jobType?.description ?? "",
    supportsPortfolio: jobType?.supportsPortfolio ?? false,
    supportsAccount: jobType?.supportsAccount ?? true,
    order: jobType?.order ?? 100,
    enabled: jobType?.enabled ?? true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  const idEditable = !jobType;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="id" className="block text-sm font-medium text-gray-700 mb-2">
          ID (unique, lowercase, used in job definitions)
        </label>
        <input
          type="text"
          id="id"
          value={formData.id}
          onChange={(e) =>
            setFormData({ ...formData, id: e.target.value.trim().toLowerCase().replace(/\s+/g, "-") })
          }
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-mono"
          placeholder="e.g. smartxai-weekly"
          required
          disabled={!idEditable}
          title={!idEditable ? "ID cannot be changed after creation" : undefined}
        />
      </div>

      <div>
        <label htmlFor="handlerKey" className="block text-sm font-medium text-gray-700 mb-2">
          Handler Key
        </label>
        <select
          id="handlerKey"
          value={formData.handlerKey}
          onChange={(e) => setFormData({ ...formData, handlerKey: e.target.value })}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
          required
        >
          {REPORT_HANDLER_KEYS.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
          Name
        </label>
        <input
          type="text"
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          placeholder="e.g. SmartXAI Report"
          required
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
          Description
        </label>
        <textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          placeholder="Brief description of this job type"
          rows={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.supportsPortfolio}
            onChange={(e) => setFormData({ ...formData, supportsPortfolio: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">Supports Portfolio</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.supportsAccount}
            onChange={(e) => setFormData({ ...formData, supportsAccount: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">Supports Account</span>
        </label>
      </div>

      <div>
        <label htmlFor="order" className="block text-sm font-medium text-gray-700 mb-2">
          Order (display sort)
        </label>
        <input
          type="number"
          id="order"
          value={formData.order}
          onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value, 10) || 0 })}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          min={0}
        />
      </div>

      {jobType && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.enabled}
            onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">Enabled</span>
        </label>
      )}

      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading || !formData.id || !formData.name}
          className="flex-1 px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? "Saving..." : jobType ? "Update Job Type" : "Create Job Type"}
        </button>
      </div>
    </form>
  );
}
