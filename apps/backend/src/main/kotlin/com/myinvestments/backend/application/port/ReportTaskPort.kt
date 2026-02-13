package com.myinvestments.backend.application.port

import arrow.core.Either
import com.myinvestments.backend.application.dto.ReportTaskScheduleDto
import com.myinvestments.backend.domain.error.DomainError

interface ReportTaskPort {
    /** All report jobs with status=active and non-blank scheduleCron (UTC). */
    fun findActiveScheduledTasks(): Either<DomainError, List<ReportTaskScheduleDto>>
}
