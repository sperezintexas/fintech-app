"use client";

import { useState, useMemo } from "react";
import { REPORT_HANDLER_KEYS } from "@/lib/report-type-constants";
import type { AlertDeliveryChannel } from "@/types/portfolio";
import {
  REPORT_TEMPLATES,
  getReportTemplate,
  type ReportTemplateId,
} from "@/types/portfolio";

export type JobTypeFormData = {
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
  defaultTemplateId?: ReportTemplateId;
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
  defaultConfig?: Record<string, unknown>;
  defaultDeliveryChannels?: AlertDeliveryChannel[];
  defaultTemplateId?: ReportTemplateId;
};

type JobTypeFormProps = {
  jobType?: JobType;
  onSubmit: (data: JobTypeFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
};

/** Default delivery channels: Slack or X only. */
const CHANNEL_OPTIONS: { value: AlertDeliveryChannel; label: string }[] = [
  { value: "slack", label: "Slack" },
  { value: "twitter", label: "X" },
];

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
    defaultConfig: jobType?.defaultConfig ?? undefined,
    defaultDeliveryChannels: jobType?.defaultDeliveryChannels ?? ["slack"],
    defaultTemplateId: jobType?.defaultTemplateId ?? "concise",
  });

  const _setConfig = (updates: Record<string, unknown>) => {
    setFormData((prev) => ({
      ...prev,
      defaultConfig: { ...prev.defaultConfig, ...updates },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: JobTypeFormData = { ...formData };
    if (payload.defaultConfig && Object.keys(payload.defaultConfig).length === 0) {
      payload.defaultConfig = undefined;
    }
    if (!payload.defaultDeliveryChannels?.length) {
      payload.defaultDeliveryChannels = undefined;
    }
    await onSubmit(payload);
  };

  const idEditable = !jobType;
  const _config = formData.defaultConfig ?? {};
  const channels = formData.defaultDeliveryChannels ?? [];
  const templateId = formData.defaultTemplateId ?? "concise";

  const previewSample = useMemo(() => {
    const d = new Date();
    const dateStr = `${d.toISOString().slice(0, 10)} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    const template = getReportTemplate(templateId);
    const vars = {
      date: dateStr,
      reportName: formData.name || "Sample Report",
      account: "Sample Account",
      stocks: "TSLA • AAPL • NVDA",
      options: "TSLA260206C00430000 • AAPL260220C00180000",
    };
    const slack = template.slackTemplate
      .replace(/\{date\}/g, vars.date)
      .replace(/\{reportName\}/g, vars.reportName)
      .replace(/\{account\}/g, vars.account)
      .replace(/\{stocks\}/g, vars.stocks)
      .replace(/\{options\}/g, vars.options);
    const x = template.xTemplate
      .replace(/\{date\}/g, vars.date)
      .replace(/\{reportName\}/g, vars.reportName)
      .replace(/\{stocks\}/g, vars.stocks)
      .replace(/\{options\}/g, vars.options);
    return { slack, x };
  }, [templateId, formData.name]);

  const toggleChannel = (ch: AlertDeliveryChannel) => {
    const next = channels.includes(ch) ? channels.filter((c) => c !== ch) : [...channels, ch];
    setFormData((prev) => ({ ...prev, defaultDeliveryChannels: next.length ? next : undefined }));
  };

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

      {/* Message template */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Message template
        </label>
        <p className="text-xs text-gray-500 mb-2">
          Template used for report output (Slack/X). Default: concise.
        </p>
        <div className="flex flex-wrap gap-2">
          {REPORT_TEMPLATES.map((t) => (
            <label
              key={t.id}
              className={`px-3 py-2 rounded-lg border cursor-pointer text-sm ${
                templateId === t.id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-700"
              }`}
            >
              <input
                type="radio"
                name="template"
                className="mr-2"
                checked={templateId === t.id}
                onChange={() => setFormData((prev) => ({ ...prev, defaultTemplateId: t.id }))}
              />
              {t.name}
            </label>
          ))}
        </div>
      </div>

      {/* Default delivery channels (Slack or X only) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Default delivery channel(s)
        </label>
        <p className="text-xs text-gray-500 mb-2">
          Used when creating new jobs and when running this type on demand (e.g. Option Scanner from xStrategyBuilder).
          Select one or both.
        </p>
        <div className="flex flex-wrap gap-2">
          {CHANNEL_OPTIONS.map(({ value, label }) => (
            <label
              key={value}
              className={`px-3 py-2 rounded-lg border cursor-pointer text-sm ${
                channels.includes(value) ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-700"
              }`}
            >
              <input
                type="checkbox"
                className="mr-2"
                checked={channels.includes(value)}
                onChange={() => toggleChannel(value)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Delivery channel preview */}
      {channels.length > 0 && (
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
          <h5 className="text-sm font-medium text-gray-700 mb-3">Delivery preview</h5>
          <p className="text-xs text-gray-500 mb-3">
            Sample of how the message will appear for each selected channel.
          </p>
          <div className="space-y-3">
            {channels.includes("slack") && (
              <div>
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Slack</span>
                <pre className="mt-1 p-3 bg-white border border-gray-200 rounded-lg text-sm whitespace-pre-wrap break-words font-sans">
                  {previewSample.slack}
                </pre>
              </div>
            )}
            {channels.includes("twitter") && (
              <div>
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">X</span>
                <pre className="mt-1 p-3 bg-white border border-gray-200 rounded-lg text-sm whitespace-pre-wrap break-words font-sans">
                  {previewSample.x}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Type-specific default config (unifiedOptionsScanner uses nested config; no form here) */}

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
