package com.myinvestments.backend.adapter.`in`.web

import com.myinvestments.backend.application.usecase.AppConfigUseCase
import com.myinvestments.backend.domain.error.DomainError
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

@RestController
class AppConfigController(private val appConfigUseCase: AppConfigUseCase) {

    @GetMapping("/app-config")
    fun getAppConfig(): ResponseEntity<*> =
        appConfigUseCase.getAppConfig().fold(
            { err ->
                when (err) {
                    is DomainError.Persistence -> ResponseEntity.status(503).body(mapOf("error" to err.message))
                    else -> ResponseEntity.status(500).body(mapOf("error" to "App config failed"))
                }
            },
            { ResponseEntity.ok(it) },
        )
}
