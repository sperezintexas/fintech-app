package com.myinvestments.backend.adapter.`in`.web

import com.myinvestments.backend.application.dto.toDto
import com.myinvestments.backend.application.usecase.ActivityUseCase
import com.myinvestments.backend.domain.error.DomainError
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/activities")
class ActivitiesController(private val activityUseCase: ActivityUseCase) {

    @GetMapping
    fun list(@RequestParam accountId: String): ResponseEntity<*> {
        if (accountId.isBlank()) return ResponseEntity.badRequest().body(mapOf("error" to "accountId is required"))
        return activityUseCase.getByAccountId(accountId).fold(
            { err -> toError(err) },
            { list -> ResponseEntity.ok(list.map { it.toDto() }) },
        )
    }

    @DeleteMapping
    fun deleteAll(@RequestParam accountId: String): ResponseEntity<*> {
        if (accountId.isBlank()) return ResponseEntity.badRequest().body(mapOf("error" to "accountId is required"))
        return activityUseCase.deleteByAccountId(accountId).fold(
            { err -> toError(err) },
            { deleted -> ResponseEntity.ok(mapOf("deleted" to deleted)) },
        )
    }

    private fun toError(err: DomainError): ResponseEntity<*> =
        when (err) {
            is DomainError.NotFound -> ResponseEntity.notFound().build<Any>()
            is DomainError.InvalidInput -> ResponseEntity.badRequest().body(mapOf("error" to err.message))
            is DomainError.Persistence -> ResponseEntity.status(500).body(mapOf("error" to err.message))
        }
}
