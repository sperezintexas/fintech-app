package com.myinvestments.backend.adapter.`in`.web

import com.myinvestments.backend.application.dto.LiveResponseDto
import com.myinvestments.backend.application.usecase.HealthUseCase
import com.myinvestments.backend.domain.error.DomainError
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Instant

@RestController
class HealthController(private val healthUseCase: HealthUseCase) {

    @GetMapping("/health/live")
    fun live(): ResponseEntity<LiveResponseDto> =
        ResponseEntity.ok(LiveResponseDto(timestamp = Instant.now().toString()))

    @GetMapping("/health")
    fun health(): ResponseEntity<*> =
        healthUseCase.getReadiness().fold(
            { err ->
                when (err) {
                    is DomainError.Persistence -> ResponseEntity.status(503).body(mapOf("error" to (err.message)))
                    else -> ResponseEntity.status(500).body(mapOf("error" to "Health check failed"))
                }
            },
            { body -> ResponseEntity.ok(body) },
        )
}
