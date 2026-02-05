"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { JobTypeList } from "@/components/JobTypeList";
import { JobTypeForm } from "@/components/JobTypeForm";
import type { JobTypeFormData } from "@/components/JobTypeForm";
import type { AlertDeliveryChannel } from "@/types/portfolio";

type JobTypeItem = {
  _id: string;
  id: string;
  name: string;
  description: string;
  handlerKey: string;
  supportsPortfolio: boolean;
  supportsAccount: boolean;
  order: number;
  enabled: boolean;
  defaultConfig?: Record<string, unknown>;
  defaultDeliveryChannels?: AlertDeliveryChannel[];
};

export default function JobTypesPage() {
  const [jobTypes, setJobTypes] = useState<JobTypeItem[]>([]);
  const [showJobTypeForm, setShowJobTypeForm] = useState(false);
  const [editingJobType, setEditingJobType] = useState<JobTypeItem | undefined>();
  const [jobTypeSaving, setJobTypeSaving] = useState(false);
  const [jobTypeDeleting, setJobTypeDeleting] = useState<string | undefined>();
  const [jobTypeToggling, setJobTypeToggling] = useState<string | undefined>();
  const [jobTypeError, setJobTypeError] = useState<string | null>(null);

  const fetchJobTypes = useCallback(async () => {
    try {
      const res = await fetch("/api/report-types?all=true", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setJobTypes(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to fetch job types:", err);
    }
  }, []);

  useEffect(() => {
    fetchJobTypes();
  }, [fetchJobTypes]);

  const handleJobTypeSubmit = async (data: JobTypeFormData) => {
    setJobTypeSaving(true);
    setJobTypeError(null);
    try {
      const url = editingJobType ? `/api/report-types/${editingJobType._id}` : "/api/report-types";
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
      setShowJobTypeForm(false);
      setEditingJobType(undefined);
    } catch (err) {
      setJobTypeError(err instanceof Error ? err.message : "Failed to save job type");
    } finally {
      setJobTypeSaving(false);
    }
  };

  const handleJobTypeDelete = async (id: string) => {
    if (!confirm("Delete this job type? Jobs using it must be updated first.")) return;
    setJobTypeDeleting(id);
    setJobTypeError(null);
    try {
      const res = await fetch(`/api/report-types/${id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to delete");
      await fetchJobTypes();
    } catch (err) {
      setJobTypeError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setJobTypeDeleting(undefined);
    }
  };

  const handleJobTypeToggle = async (jt: JobTypeItem) => {
    setJobTypeToggling(jt._id);
    setJobTypeError(null);
    try {
      const res = await fetch(`/api/report-types/${jt._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !jt.enabled }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to update");
      await fetchJobTypes();
    } catch (err) {
      setJobTypeError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setJobTypeToggling(undefined);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <AppHeader />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link href="/automation?tab=jobs" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            ← Back to Setup
          </Link>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Job types</h2>
            <p className="text-gray-600 mt-1">Define report/job types used by scheduled jobs.</p>
          </div>
          {!showJobTypeForm && (
            <button
              type="button"
              onClick={() => {
                setEditingJobType(undefined);
                setShowJobTypeForm(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              New job type
            </button>
          )}
        </div>

        {jobTypeError && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {jobTypeError}
          </div>
        )}

        {showJobTypeForm && (
          <div className="mb-6 p-6 bg-white rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {editingJobType ? "Edit Job Type" : "Create Job Type"}
            </h3>
            <JobTypeForm
              jobType={editingJobType}
              onSubmit={handleJobTypeSubmit}
              onCancel={() => {
                setShowJobTypeForm(false);
                setEditingJobType(undefined);
              }}
              isLoading={jobTypeSaving}
            />
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <JobTypeList
            jobTypes={jobTypes}
            onEdit={(jt) => {
              setEditingJobType(jt);
              setShowJobTypeForm(true);
            }}
            onDelete={handleJobTypeDelete}
            onToggleEnabled={handleJobTypeToggle}
            isDeleting={jobTypeDeleting}
            isToggling={jobTypeToggling}
          />
        </div>
      </main>
    </div>
  );
}
