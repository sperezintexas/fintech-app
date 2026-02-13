package com.myinvestments.backend.adapter.`in`.web

import com.myinvestments.backend.application.usecase.DashboardUseCase
import com.myinvestments.backend.application.usecase.TimelineUseCase
import com.myinvestments.backend.domain.error.DomainError
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
class DashboardController(
    private val dashboardUseCase: DashboardUseCase,
    private val timelineUseCase: TimelineUseCase,
) {

    @GetMapping("/dashboard")
    fun getDashboard(): ResponseEntity<*> =
        dashboardUseCase.getDashboard().fold(
            { err ->
                when (err) {
                    is DomainError.Persistence -> ResponseEntity.status(503).body(mapOf("error" to err.message))
                    else -> ResponseEntity.status(500).body(mapOf("error" to "Dashboard failed"))
                }
            },
            { ResponseEntity.ok(it) },
        )

    @GetMapping("/dashboard/timeline")
    fun getTimeline(@RequestParam(defaultValue = "1mo") range: String): ResponseEntity<*> =
        timelineUseCase.getTimeline(range).fold(
            { err ->
                when (err) {
                    is DomainError.Persistence -> ResponseEntity.status(503).body(mapOf("error" to err.message))
                    else -> ResponseEntity.status(500).body(mapOf("error" to "Timeline failed"))
                }
            },
            { ResponseEntity.ok(it) },
        )
}
