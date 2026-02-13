package com.myinvestments.backend.application.dto

/**
 * Minimal view of a report task for scheduling (reportJobs collection).
 * Backend triggers run-task by taskId when cron is due.
 */
data class ReportTaskScheduleDto(
    val id: String,
    val scheduleCron: String,
    val lastRunAt: String?,
)
