"use client";

import { useState, useEffect, useCallback } from "react";
import { JobTypeList } from "@/components/JobTypeList";
import { JobTypeForm } from "@/components/JobTypeForm";
import type { JobTypeFormData } from "@/components/JobTypeForm";
import type { AlertDeliveryChannel } from "@/types/portfolio";

type TaskTypeItem = {
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

export default function AutomationTaskTypesPage() {
  const [taskTypes, setTaskTypes] = useState<TaskTypeItem[]>([]);
  const [showTaskTypeForm, setShowTaskTypeForm] = useState(false);
  const [editingTaskType, setEditingTaskType] = useState<TaskTypeItem | undefined>();
  const [taskTypeSaving, setTaskTypeSaving] = useState(false);
  const [taskTypeDeleting, setTaskTypeDeleting] = useState<string | undefined>();
  const [taskTypeToggling, setTaskTypeToggling] = useState<string | undefined>();
  const [taskTypeError, setTaskTypeError] = useState<string | null>(null);

  const fetchTaskTypes = useCallback(async () => {
    try {
      const res = await fetch("/api/report-types?all=true", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setTaskTypes(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to fetch task types:", err);
    }
  }, []);

  useEffect(() => {
    fetchTaskTypes();
  }, [fetchTaskTypes]);

  const handleTaskTypeSubmit = async (data: JobTypeFormData) => {
    setTaskTypeSaving(true);
    setTaskTypeError(null);
    try {
      const url = editingTaskType ? `/api/report-types/${editingTaskType._id}` : "/api/report-types";
      const method = editingTaskType ? "PUT" : "POST";
      const body = editingTaskType
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
      if (!res.ok) throw new Error(json.error ?? "Failed to save task type");
      await fetchTaskTypes();
      setShowTaskTypeForm(false);
      setEditingTaskType(undefined);
    } catch (err) {
      setTaskTypeError(err instanceof Error ? err.message : "Failed to save task type");
    } finally {
      setTaskTypeSaving(false);
    }
  };

  const handleTaskTypeDelete = async (id: string) => {
    if (!confirm("Delete this task type? Tasks using it must be updated first.")) return;
    setTaskTypeDeleting(id);
    setTaskTypeError(null);
    try {
      const res = await fetch(`/api/report-types/${id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to delete");
      await fetchTaskTypes();
    } catch (err) {
      setTaskTypeError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setTaskTypeDeleting(undefined);
    }
  };

  const handleTaskTypeToggle = async (jt: TaskTypeItem) => {
    setTaskTypeToggling(jt._id);
    setTaskTypeError(null);
    try {
      const res = await fetch(`/api/report-types/${jt._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !jt.enabled }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to update");
      await fetchTaskTypes();
    } catch (err) {
      setTaskTypeError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setTaskTypeToggling(undefined);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Task types</h2>
          <p className="text-gray-600 mt-1 text-sm">Define report/task types used by scheduled tasks.</p>
        </div>
        {!showTaskTypeForm && (
          <button
            type="button"
            onClick={() => {
              setEditingTaskType(undefined);
              setShowTaskTypeForm(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            New task type
          </button>
        )}
      </div>

      {taskTypeError && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {taskTypeError}
        </div>
      )}

      {showTaskTypeForm && (
        <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {editingTaskType ? "Edit Task Type" : "Create Task Type"}
          </h3>
          <JobTypeForm
            jobType={editingTaskType}
            onSubmit={handleTaskTypeSubmit}
            onCancel={() => {
              setShowTaskTypeForm(false);
              setEditingTaskType(undefined);
            }}
            isLoading={taskTypeSaving}
          />
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <JobTypeList
          jobTypes={taskTypes}
          onEdit={(jt) => {
            setEditingTaskType(jt);
            setShowTaskTypeForm(true);
          }}
          onDelete={handleTaskTypeDelete}
          onToggleEnabled={handleTaskTypeToggle}
          isDeleting={taskTypeDeleting}
          isToggling={taskTypeToggling}
        />
      </div>
    </div>
  );
}
