"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import type { Account, Job, AlertDeliveryChannel, ReportTemplateId } from "@/types/portfolio";
import { REPORT_TEMPLATES } from "@/types/portfolio";
import { cronToHuman } from "@/lib/cron-utils";

const DEFAULT_SCHEDULE_JOB_NAMES = [
  "Weekly Portfolio",
  "Daily Options Scanner",
  "Watchlist Snapshot",
  "Deliver Alerts",
  "Data Cleanup",
] as const;

const SCHEDULE_PRESETS: Array<{ label: string; cron: string }> = [
  { label: "Weekly Portfolio (Sun 6 PM)", cron: "0 18 * * 0" },
  { label: "Daily Options Scanner (Mon–Fri 4 PM)", cron: "0 16 * * 1-5" },
  { label: "Watchlist Snapshot (Mon–Fri 9 AM & 4 PM)", cron: "0 9,16 * * 1-5" },
  { label: "Deliver Alerts (Mon–Fri 4:30 PM)", cron: "30 16 * * 1-5" },
  { label: "Data Cleanup (Daily 3 AM)", cron: "0 3 * * *" },
  { label: "Weekdays 4:00 PM", cron: "0 16 * * 1-5" },
  { label: "Weekdays 9:00 AM", cron: "0 9 * * 1-5" },
];

type ScheduledJob = {
  id: string;
  name: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastFinishedAt: string | null;
  failCount: number;
};

type JobTypeItem = {
  _id: string;
  id: string;
  name: string;
  description?: string;
  handlerKey: string;
  enabled: boolean;
  supportsPortfolio: boolean;
  supportsAccount: boolean;
};

export default function SchedulerPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [jobTypes, setJobTypes] = useState<JobTypeItem[]>([]);
  const [showJobForm, setShowJobForm] = useState(false);
  const [jobFormError, setJobFormError] = useState("");
  const [jobFormSaving, setJobFormSaving] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [jobForm, setJobForm] = useState<{
    name: string;
    jobType: string;
    messageTemplate?: string;
    templateId: ReportTemplateId;
    customSlackTemplate: string;
    scannerConfig?: Record<string, unknown>;
    config?: Record<string, unknown>;
    scheduleCron: string;
    channels: AlertDeliveryChannel[];
    status: "active" | "paused";
  }>({
    name: "",
    jobType: "smartxai",
    templateId: "concise",
    customSlackTemplate: "",
    scheduleCron: "0 16 * * 1-5",
    channels: ["slack"],
    status: "active",
  });
  const [jobScheduleTime, setJobScheduleTime] = useState("16:00");
  const [jobScheduleFreq, setJobScheduleFreq] = useState<"daily" | "weekdays" | "sunday">("weekdays");
  const [schedulerStatus, setSchedulerStatus] = useState<{ status: string; jobs: ScheduledJob[] } | null>(null);
  const [schedulerLoading, setSchedulerLoading] = useState(false);
  const [schedulerMessage, setSchedulerMessage] = useState("");
  const [lastRunResult, setLastRunResult] = useState<{
    jobName: string;
    message: string;
    summary?: string;
    isError: boolean;
  } | null>(null);

  const scheduleToCron = (time: string, freq: "daily" | "weekdays" | "sunday"): string => {
    const [h, m] = time.split(":").map((x) => parseInt(x, 10) || 0);
    const hour = Math.min(23, Math.max(0, h));
    const minute = Math.min(59, Math.max(0, m));
    if (freq === "sunday") return `${minute} ${hour} * * 0`;
    if (freq === "weekdays") return `${minute} ${hour} * * 1-5`;
    return `${minute} ${hour} * * *`;
  };

  const fetchJobs = useCallback(async () => {
    const isPortfolio = selectedAccountId === "__portfolio__" || !selectedAccountId;
    const url = isPortfolio ? "/api/jobs?all=1" : `/api/jobs?accountId=${encodeURIComponent(selectedAccountId)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setJobs(Array.isArray(data) ? data : []);
    }
  }, [selectedAccountId]);

  const fetchAllJobs = useCallback(async () => {
    const res = await fetch("/api/jobs?all=1");
    if (res.ok) {
      const data = await res.json();
      setAllJobs(Array.isArray(data) ? data : []);
    }
  }, []);

  const fetchJobTypes = useCallback(async () => {
    const res = await fetch("/api/report-types?all=true", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setJobTypes(Array.isArray(data) ? data : []);
    }
  }, []);

  const fetchSchedulerStatus = useCallback(async () => {
    setSchedulerLoading(true);
    try {
      const res = await fetch("/api/scheduler");
      if (res.ok) {
        const data = await res.json();
        setSchedulerStatus(data);
      }
    } catch {
      // ignore
    } finally {
      setSchedulerLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/accounts");
      if (res.ok) {
        const data = await res.json();
        setAccounts(Array.isArray(data) ? data : []);
        if (data.length > 0 && !selectedAccountId) setSelectedAccountId("__portfolio__");
      }
    })();
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    fetchAllJobs();
    fetchJobTypes();
    fetchSchedulerStatus();
  }, [fetchAllJobs, fetchJobTypes, fetchSchedulerStatus]);

  const handleSchedulerAction = async (action: string, jobName?: string) => {
    setSchedulerLoading(true);
    setSchedulerMessage("");
    try {
      const res = await fetch("/api/scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, jobName }),
      });
      const data = await res.json();
      if (res.ok) {
        setSchedulerMessage(data.message || "Action completed");
        await fetchSchedulerStatus();
        await fetchAllJobs();
      } else {
        setSchedulerMessage(`Error: ${data.error ?? "Action failed"}`);
      }
    } catch {
      setSchedulerMessage("Error: Request failed");
    } finally {
      setSchedulerLoading(false);
    }
  };

  const openEditJob = (j: Job) => {
    setEditingJobId(j._id);
    setJobFormError("");
    const cronParts = (j.scheduleCron ?? "0 16 * * 1-5").trim().split(/\s+/);
    if (cronParts.length >= 5) {
      const minute = (cronParts[0] ?? "0").split(",")[0] ?? "0";
      const hourRaw = (cronParts[1] ?? "16").split(",")[0] ?? "16";
      const dow = cronParts[4] ?? "*";
      setJobScheduleTime(`${String(hourRaw).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
      setJobScheduleFreq(dow === "0" ? "sunday" : dow === "*" ? "daily" : "weekdays");
    }
    setJobForm({
      name: j.name,
      jobType: j.jobType,
      messageTemplate: j.messageTemplate ?? "",
      templateId: j.templateId ?? "concise",
      customSlackTemplate: j.customSlackTemplate ?? "",
      scannerConfig: j.scannerConfig,
      config: j.config,
      scheduleCron: j.scheduleCron ?? "0 16 * * 1-5",
      channels: j.channels ?? ["slack"],
      status: j.status ?? "active",
    });
    setShowJobForm(true);
  };

  const saveJob = async () => {
    const isPortfolio = selectedAccountId === "__portfolio__" || !selectedAccountId;
    const name = jobForm.name.trim();
    if (!name) return setJobFormError("Job name is required");
    if (!jobForm.jobType) return setJobFormError("Select a job type");
    if (!jobForm.scheduleCron.trim()) return setJobFormError("Cron schedule is required");
    if (!(jobForm.channels ?? []).length) return setJobFormError("Select at least one delivery channel");
    setJobFormSaving(true);
    setJobFormError("");
    try {
      const body = {
        name,
        jobType: jobForm.jobType,
        messageTemplate: jobForm.messageTemplate?.trim() || undefined,
        templateId: jobForm.templateId,
        customSlackTemplate: jobForm.customSlackTemplate.trim() || undefined,
        scannerConfig: jobForm.scannerConfig,
        config: jobForm.config,
        scheduleCron: jobForm.scheduleCron,
        channels: jobForm.channels,
        status: jobForm.status,
      };
      const res = await fetch(
        editingJobId ? `/api/jobs/${editingJobId}` : "/api/jobs",
        {
          method: editingJobId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editingJobId ? body : { accountId: isPortfolio ? null : selectedAccountId, ...body }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setJobFormError(data.error || "Failed to save job");
        return;
      }
      setShowJobForm(false);
      setEditingJobId(null);
      await fetchJobs();
      await fetchAllJobs();
    } catch {
      setJobFormError("Failed to save job");
    } finally {
      setJobFormSaving(false);
    }
  };

  const deleteJob = async (id: string) => {
    if (!confirm("Delete this scheduled job?")) return;
    try {
      const res = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
      if (res.ok) {
        await fetchJobs();
        await fetchAllJobs();
      }
    } catch {
      // ignore
    }
  };

  const runJobNow = async (jobId: string, jobName?: string) => {
    setLastRunResult(null);
    setSchedulerMessage("");
    const name = jobName ?? jobs.find((j) => j._id === jobId)?.name ?? "Job";
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: "POST" });
      const data = (await res.json()) as { success?: boolean; message?: string; error?: string; summary?: string };
      if (res.ok && data.success) {
        setSchedulerMessage(data.message ?? "Job completed.");
        setLastRunResult({ jobName: name, message: data.message ?? "Job completed.", summary: data.summary, isError: false });
        setTimeout(() => { setSchedulerMessage(""); setLastRunResult(null); }, 15000);
      } else {
        const errMsg = `Error: ${data.error ?? "Failed to run job"}`;
        setSchedulerMessage(errMsg);
        setLastRunResult({ jobName: name, message: errMsg, isError: true });
      }
      await fetchJobs();
    } catch {
      setSchedulerMessage("Error: Failed to run job");
      setLastRunResult({ jobName: name, message: "Error: Failed to run job", isError: true });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link href="/automation?tab=jobs" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            ← Back to Setup
          </Link>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Scheduler</h2>
            <p className="text-gray-600 mt-1">Agenda cron status and run-now. Manage report jobs below.</p>
          </div>
          <div>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="__portfolio__">Portfolio (all accounts)</option>
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Scheduler block */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Agenda</h3>
          <p className="text-sm text-gray-600 mb-4">Quick actions and cron status. Jobs persist in MongoDB.</p>
          <div className="flex flex-wrap gap-3 mb-4">
            <button
              onClick={() => handleSchedulerAction("createRecommendedJobs")}
              disabled={schedulerLoading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
            >
              Create Recommended Jobs
            </button>
            <button
              onClick={() => handleSchedulerAction("runPortfolio")}
              disabled={schedulerLoading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
            >
              Run Portfolio Now
            </button>
            <button
              onClick={fetchSchedulerStatus}
              disabled={schedulerLoading}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Refresh Status
            </button>
            <Link
              href="/automation/job-history"
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Job run history
            </Link>
            <Link href="/health" className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
              Health Status
            </Link>
          </div>
          {schedulerMessage && (
            <div className={`mb-4 p-3 rounded-lg ${schedulerMessage.startsWith("Error") ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>
              {schedulerMessage}
            </div>
          )}
          {schedulerStatus && (
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-2 px-3 text-left font-medium text-gray-600">Job Name</th>
                    <th className="py-2 px-3 text-left font-medium text-gray-600">Last Run</th>
                    <th className="py-2 px-3 text-left font-medium text-gray-600">Next Run</th>
                    <th className="py-2 px-3 text-left font-medium text-gray-600">Status</th>
                    <th className="py-2 px-3 text-center font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {schedulerStatus.jobs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-500">
                        No scheduled jobs. Click &quot;Create Recommended Jobs&quot; to add them.
                      </td>
                    </tr>
                  ) : (
                    schedulerStatus.jobs.map((job) => (
                      <tr key={job.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-3 font-medium">{job.name}</td>
                        <td className="py-3 px-3 text-gray-600">
                          {job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : "Never"}
                        </td>
                        <td className="py-3 px-3 text-gray-600">
                          {job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : "Not scheduled"}
                        </td>
                        <td className="py-3 px-3">
                          {job.failCount > 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">Failed ({job.failCount}x)</span>
                          ) : job.nextRunAt ? (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">Scheduled</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">Inactive</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => handleSchedulerAction("run", job.name)} className="text-indigo-600 hover:text-indigo-800" title="Run Now">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </button>
                            <button onClick={() => handleSchedulerAction("cancel", job.name)} className="text-red-600 hover:text-red-800" title="Cancel">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4">
            <h4 className="font-medium text-blue-900 mb-2">Schedule Management</h4>
            <p className="text-sm text-blue-800 mb-3">Edit schedules for default jobs. Create recommended jobs if they don&apos;t exist yet.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-blue-200">
                    <th className="py-2 px-3 text-left font-medium text-blue-900">Job</th>
                    <th className="py-2 px-3 text-left font-medium text-blue-900">Schedule</th>
                    <th className="py-2 px-3 text-left font-medium text-blue-900">Next Run</th>
                    <th className="py-2 px-3 text-right font-medium text-blue-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {DEFAULT_SCHEDULE_JOB_NAMES.map((name) => {
                    const job = allJobs.find((j) => j.name === name);
                    const scheduleFriendly = job?.scheduleCron ? cronToHuman(job.scheduleCron) : "—";
                    const nextRunFriendly = job?.nextRunAt ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(job.nextRunAt)) : "—";
                    return (
                      <tr key={name} className="border-b border-blue-100 hover:bg-blue-50/50">
                        <td className="py-2 px-3 font-medium text-blue-900">{name}</td>
                        <td className="py-2 px-3 text-blue-800">{scheduleFriendly}</td>
                        <td className="py-2 px-3 text-blue-700">{nextRunFriendly}</td>
                        <td className="py-2 px-3 text-right">
                          {job ? (
                            <button onClick={() => openEditJob(job)} className="text-blue-600 hover:text-blue-800 font-medium">Edit Schedule</button>
                          ) : (
                            <span className="text-blue-600/60 text-xs">Not created</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Manage Jobs */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Manage Jobs</h3>
              <p className="text-sm text-gray-600">Create, edit, and run report jobs. Each job uses a job type (see <Link href="/job-types" className="text-blue-600 hover:underline">Job types</Link>).</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingJobId(null);
                setJobFormError("");
                setJobForm({ name: "", jobType: "smartxai", templateId: "concise", customSlackTemplate: "", scheduleCron: "0 16 * * 1-5", channels: ["slack"], status: "active" });
                setJobScheduleTime("16:00");
                setJobScheduleFreq("weekdays");
                setShowJobForm(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              New Job
            </button>
          </div>
          {lastRunResult && (
            <div className={`mb-4 p-4 rounded-xl border ${lastRunResult.isError ? "bg-red-50 border-red-200 text-red-800" : "bg-green-50 border-green-200 text-green-800"}`}>
              <p className="font-medium mb-1">{lastRunResult.jobName}: {lastRunResult.message}</p>
              {lastRunResult.summary && <pre className="mt-2 text-sm whitespace-pre-wrap font-sans opacity-90">{lastRunResult.summary}</pre>}
            </div>
          )}
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Create Job</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name</label>
                <input value={jobForm.name} onChange={(e) => setJobForm({ ...jobForm, name: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="e.g. Daily close report" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Job Type</label>
                <select value={jobForm.jobType} onChange={(e) => setJobForm({ ...jobForm, jobType: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm">
                  {(() => {
                    const isPortfolio = selectedAccountId === "__portfolio__" || !selectedAccountId;
                    const filtered = jobTypes.filter((t) => t.enabled && (isPortfolio ? t.supportsPortfolio : t.supportsAccount));
                    if (filtered.length === 0) return <option value="">No job types</option>;
                    return (<><option value="">Select job type</option>{filtered.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</>);
                  })()}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Time</label>
                <input type="time" value={jobScheduleTime} onChange={(e) => { const v = e.target.value; setJobScheduleTime(v); setJobForm({ ...jobForm, scheduleCron: scheduleToCron(v, jobScheduleFreq) }); }} className="w-full px-3 py-2 border border-gray-200 rounded-lg font-mono text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Frequency</label>
                <select value={jobScheduleFreq} onChange={(e) => { const v = e.target.value as "daily" | "weekdays" | "sunday"; setJobScheduleFreq(v); setJobForm({ ...jobForm, scheduleCron: scheduleToCron(jobScheduleTime, v) }); }} className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm">
                  <option value="weekdays">Weekdays (Mon–Fri)</option>
                  <option value="daily">Daily</option>
                  <option value="sunday">Sunday only</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  setJobFormError("");
                  const isPortfolio = selectedAccountId === "__portfolio__" || !selectedAccountId;
                  const name = jobForm.name.trim();
                  if (!name) return setJobFormError("Name is required");
                  if (!jobForm.jobType) return setJobFormError("Select a job type");
                  if (!(jobForm.channels ?? []).length) return setJobFormError("Select at least one delivery channel");
                  setJobFormSaving(true);
                  try {
                    const body = { accountId: isPortfolio ? null : selectedAccountId, name, jobType: jobForm.jobType, messageTemplate: jobForm.messageTemplate?.trim() || undefined, scheduleCron: jobForm.scheduleCron, templateId: jobForm.templateId, config: jobForm.config, channels: jobForm.channels, status: "active" as const };
                    const res = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                    const data = await res.json();
                    if (!res.ok) { setJobFormError(data.error || "Failed to create job"); return; }
                    setJobForm({ ...jobForm, name: "" });
                    await fetchJobs();
                    await fetchAllJobs();
                  } catch {
                    setJobFormError("Failed to create job");
                  } finally {
                    setJobFormSaving(false);
                  }
                }}
                disabled={jobTypes.length === 0 || jobFormSaving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {jobFormSaving ? "Creating…" : "Create Job"}
              </button>
              {jobFormError && !showJobForm && <span className="text-sm text-red-600">{jobFormError}</span>}
            </div>
          </div>

          {jobTypes.length === 0 ? (
            <div className="text-center py-10 text-gray-500">Loading job types…</div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-10 text-gray-500">No jobs yet. Create one above.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Schedule</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Next run</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Last run</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {jobs.map((j) => {
                    const typeInfo = jobTypes.find((t) => t.id === j.jobType);
                    const typeName = typeInfo?.name ?? j.jobType;
                    const scheduleFriendly = cronToHuman(j.scheduleCron ?? "0 16 * * 1-5");
                    const nextRunFriendly = j.nextRunAt ? new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(j.nextRunAt)) : "—";
                    const lastRunFriendly = j.lastRunAt ? new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(j.lastRunAt)) : "—";
                    return (
                      <tr key={j._id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3 font-medium text-gray-900">{j.name}</td>
                        <td className="px-4 py-3 text-gray-700">{typeName}</td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs truncate hidden lg:table-cell" title={typeInfo?.description ?? ""}>{typeInfo?.description ?? "—"}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{scheduleFriendly}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs hidden md:table-cell">{nextRunFriendly}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs hidden md:table-cell">{lastRunFriendly}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${(j.status ?? "active") === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`}>
                            {j.status ?? "active"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            <button
                              onClick={() => runJobNow(j._id, j.name)}
                              className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="Run now"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => openEditJob(j)}
                              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => deleteJob(j._id)}
                              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Edit job modal */}
          {showJobForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-semibold">{editingJobId ? "Edit Job" : "New Job"}</h4>
                  <button onClick={() => { setShowJobForm(false); setEditingJobId(null); }} className="text-gray-400 hover:text-gray-600">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                {jobFormError && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{jobFormError}</div>}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Job Name</label>
                    <input value={jobForm.name} onChange={(e) => setJobForm({ ...jobForm, name: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg" placeholder="e.g. Daily close report" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Job Type</label>
                    <select value={jobForm.jobType} onChange={(e) => setJobForm({ ...jobForm, jobType: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white">
                      {jobTypes.filter((t) => t.enabled).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  {jobTypes.find((t) => t.id === jobForm.jobType)?.handlerKey === "portfoliosummary" && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={(jobForm.config?.includeAiInsights as boolean) ?? false} onChange={(e) => setJobForm({ ...jobForm, config: { ...jobForm.config, includeAiInsights: e.target.checked } })} className="rounded border-gray-300" />
                      <span className="text-sm text-gray-700">Include AI insights</span>
                    </label>
                  )}
                  {["watchlistreport", "smartxai", "portfoliosummary"].includes(jobTypes.find((t) => t.id === jobForm.jobType)?.handlerKey ?? "") && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Message template</label>
                      <div className="flex flex-wrap gap-2">
                        {REPORT_TEMPLATES.map((template) => (
                          <button key={template.id} type="button" onClick={() => setJobForm({ ...jobForm, templateId: template.id })} className={`px-3 py-2 rounded-lg border-2 text-sm ${jobForm.templateId === template.id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 hover:border-gray-300"}`}>{template.name}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Schedule</label>
                    <select className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white" onChange={(e) => { const cron = e.target.value; if (cron) setJobForm({ ...jobForm, scheduleCron: cron }); }}>
                      <option value="">Choose preset…</option>
                      {SCHEDULE_PRESETS.map((p) => <option key={p.cron} value={p.cron}>{p.label}</option>)}
                    </select>
                    <div className="grid grid-cols-2 gap-3 mt-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Frequency</label>
                        <select value={jobScheduleFreq} onChange={(e) => { const v = e.target.value as "daily" | "weekdays" | "sunday"; setJobScheduleFreq(v); setJobForm({ ...jobForm, scheduleCron: scheduleToCron(jobScheduleTime, v) }); }} className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white">
                          <option value="daily">Daily</option>
                          <option value="weekdays">Weekdays</option>
                          <option value="sunday">Sunday only</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Time</label>
                        <input type="time" value={jobScheduleTime} onChange={(e) => { const v = e.target.value; setJobScheduleTime(v); setJobForm({ ...jobForm, scheduleCron: scheduleToCron(v, jobScheduleFreq) }); }} className="w-full px-3 py-2 border border-gray-200 rounded-lg font-mono" />
                      </div>
                    </div>
                    <input value={jobForm.scheduleCron} onChange={(e) => setJobForm({ ...jobForm, scheduleCron: e.target.value })} className="w-full mt-2 px-3 py-2 border border-gray-200 rounded-lg font-mono text-sm" placeholder="0 16 * * 1-5" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Channels</label>
                    <div className="flex flex-wrap gap-2">
                      {(["slack", "push", "twitter"] as AlertDeliveryChannel[]).map((ch) => {
                        const chans = jobForm.channels ?? [];
                        const checked = chans.includes(ch);
                        return (
                          <label key={ch} className={`px-3 py-2 rounded-lg border cursor-pointer text-sm ${checked ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-700"}`}>
                            <input type="checkbox" className="mr-2" checked={checked} onChange={(e) => { if (e.target.checked) setJobForm({ ...jobForm, channels: [...chans, ch] }); else setJobForm({ ...jobForm, channels: chans.filter((c) => c !== ch) }); }} />
                            {ch === "twitter" ? "X" : ch}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select value={jobForm.status} onChange={(e) => setJobForm({ ...jobForm, status: e.target.value as "active" | "paused" })} className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white">
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={() => { setShowJobForm(false); setEditingJobId(null); }} className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                    <button onClick={saveJob} disabled={jobFormSaving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{jobFormSaving ? "Saving..." : "Save"}</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
