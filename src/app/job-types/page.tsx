"use client";

import { useState, useEffect, useCallback } from "react";
import { AppHeader } from "@/components/AppHeader";
import { JobTypeForm } from "@/components/JobTypeForm";
import { JobTypeList } from "@/components/JobTypeList";
import type { JobTypeFormData } from "@/components/JobTypeForm";
import type { AlertDeliveryChannel, ReportTemplateId } from "@/types/portfolio";

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
  createdAt?: string;
  updatedAt?: string;
};

export default function JobTypesPage() {
  const [jobTypes, setJobTypes] = useState<JobType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | undefined>();
  const [isToggling, setIsToggling] = useState<string | undefined>();
  const [showForm, setShowForm] = useState(false);
  const [editingJobType, setEditingJobType] = useState<JobType | undefined>();
  const [error, setError] = useState<string | null>(null);

  const fetchJobTypes = useCallback(async () => {
    try {
      const res = await fetch("/api/report-types?all=true", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch job types");
      const data = await res.json();
      setJobTypes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load job types");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobTypes();
  }, [fetchJobTypes]);

  const handleSubmit = async (data: JobTypeFormData) => {
    setIsSaving(true);
    setError(null);

    try {
      const url = editingJobType
        ? `/api/report-types/${editingJobType._id}`
        : "/api/report-types";
      const method = editingJobType ? "PUT" : "POST";
      const body = editingJobType
        ? {
            id: data.id,
            handlerKey: data.handlerKey,
            name: data.name,
            description: data.description,
            supportsPortfolio: data.supportsPortfolio,
            supportsAccount: data.supportsAccount,
            order: data.order,
            enabled: data.enabled,
            defaultConfig: data.defaultConfig,
            defaultDeliveryChannels: data.defaultDeliveryChannels,
            defaultTemplateId: data.defaultTemplateId ?? "concise",
          }
        : {
            id: data.id,
            handlerKey: data.handlerKey,
            name: data.name,
            description: data.description,
            supportsPortfolio: data.supportsPortfolio,
            supportsAccount: data.supportsAccount,
            order: data.order,
            defaultConfig: data.defaultConfig,
            defaultDeliveryChannels: data.defaultDeliveryChannels,
            defaultTemplateId: data.defaultTemplateId ?? "concise",
          };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to save job type");

      await fetchJobTypes();
      setShowForm(false);
      setEditingJobType(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save job type");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this job type? Jobs using it must be updated first."))
      return;

    setIsDeleting(id);
    setError(null);

    try {
      const res = await fetch(`/api/report-types/${id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to delete job type");
      await fetchJobTypes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete job type");
    } finally {
      setIsDeleting(undefined);
    }
  };

  const handleToggleEnabled = async (jt: JobType) => {
    setIsToggling(jt._id);
    setError(null);

    try {
      const res = await fetch(`/api/report-types/${jt._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !jt.enabled }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to update job type");
      await fetchJobTypes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update job type");
    } finally {
      setIsToggling(undefined);
    }
  };

  const handleEdit = (jobType: JobType) => {
    setEditingJobType(jobType);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingJobType(undefined);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <AppHeader />

      <main className="flex min-h-[calc(100vh-4rem)]">
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Job Types</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Manage report/job types used by scheduled jobs.
                </p>
              </div>
              {!showForm && (
                <button
                  onClick={() => setShowForm(true)}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  New
                </button>
              )}
            </div>

            {showForm && (
              <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">
                  {editingJobType ? "Edit Job Type" : "Create New Job Type"}
                </h3>
                <JobTypeForm
                  jobType={editingJobType}
                  onSubmit={handleSubmit}
                  onCancel={handleCancel}
                  isLoading={isSaving}
                />
              </div>
            )}

            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <JobTypeList
                jobTypes={jobTypes}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onToggleEnabled={handleToggleEnabled}
                isDeleting={isDeleting}
                isToggling={isToggling}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
