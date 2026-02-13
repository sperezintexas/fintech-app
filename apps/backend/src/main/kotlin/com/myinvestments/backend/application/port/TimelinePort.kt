package com.myinvestments.backend.application.port

import arrow.core.Either
import com.myinvestments.backend.application.dto.TimelinePointDto
import com.myinvestments.backend.domain.error.DomainError

interface TimelinePort {
    fun getTimelinePoints(rangeDays: Int): Either<DomainError, List<TimelinePointDto>>
}
