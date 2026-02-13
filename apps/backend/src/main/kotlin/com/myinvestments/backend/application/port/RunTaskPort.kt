package com.myinvestments.backend.application.port

import arrow.core.Either
import com.myinvestments.backend.domain.error.DomainError

/**
 * Triggers task execution on the Next.js app (POST /api/internal/run-task).
 * Used by the Spring scheduler.
 */
interface RunTaskPort {
    /** Run a report task by ID. */
    fun runTask(taskId: String): Either<DomainError, Unit>

    /** Run a built-in job by name (e.g. refreshHoldingsPrices). */
    fun runBuiltInJob(jobName: String, lastRun: String?): Either<DomainError, Unit>
}
