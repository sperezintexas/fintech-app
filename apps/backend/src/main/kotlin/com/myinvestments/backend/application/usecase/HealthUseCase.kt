package com.myinvestments.backend.application.usecase

import arrow.core.Either
import com.myinvestments.backend.application.dto.HealthCheckDto
import com.myinvestments.backend.application.dto.HealthResponseDto
import com.myinvestments.backend.application.port.HealthPort
import com.myinvestments.backend.domain.error.DomainError
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.time.Instant

@Component
class HealthUseCase(private val healthPort: HealthPort) {

    @Value("\${app.version:}")
    private val version: String = ""

    fun getReadiness(): Either<DomainError, HealthResponseDto> {
        val checks = mutableMapOf<String, HealthCheckDto>()
        checks["app"] = HealthCheckDto(status = "ok")
        var overallStatus = "ok"

        healthPort.checkMongo().fold(
            { err ->
                checks["mongodb"] = HealthCheckDto(
                    status = "error",
                    message = (err as? DomainError.Persistence)?.message ?: "Connection failed",
                )
                overallStatus = "error"
            },
            { result ->
                checks["mongodb"] = HealthCheckDto(
                    status = if (result.ok) "ok" else "error",
                    latencyMs = result.latencyMs,
                    message = result.message,
                )
                if (!result.ok) overallStatus = "error"
            },
        )

        return Either.Right(
            HealthResponseDto(
                status = overallStatus,
                version = version.ifBlank { null },
                timestamp = Instant.now().toString(),
                checks = checks,
            ),
        )
    }
}
