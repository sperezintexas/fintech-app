package com.myinvestments.backend.application.usecase

import arrow.core.Either
import com.myinvestments.backend.application.dto.TimelineResponseDto
import com.myinvestments.backend.application.dto.TimelinePointDto
import com.myinvestments.backend.application.port.TimelinePort
import com.myinvestments.backend.domain.error.DomainError
import org.springframework.stereotype.Component

@Component
class TimelineUseCase(private val timelinePort: TimelinePort) {

    fun getTimeline(range: String): Either<DomainError, TimelineResponseDto> {
        val days = when (range.lowercase()) {
            "1w" -> 7
            "1yr" -> 365
            else -> 30 // 1mo default
        }
        return timelinePort.getTimelinePoints(days).map { points ->
            TimelineResponseDto(points = points)
        }
    }
}
