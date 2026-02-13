package com.myinvestments.backend.adapter.`in`.web

import com.myinvestments.backend.application.usecase.ProfileUseCase
import com.myinvestments.backend.domain.error.DomainError
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

@RestController
class ProfileController(private val profileUseCase: ProfileUseCase) {

    @GetMapping("/profile")
    fun getProfile(): ResponseEntity<*> =
        profileUseCase.getProfile().fold(
            { err ->
                when (err) {
                    is DomainError.Persistence -> ResponseEntity.status(503).body(mapOf("error" to err.message))
                    else -> ResponseEntity.status(500).body(mapOf("error" to "Profile failed"))
                }
            },
            { ResponseEntity.ok(it) },
        )
}
