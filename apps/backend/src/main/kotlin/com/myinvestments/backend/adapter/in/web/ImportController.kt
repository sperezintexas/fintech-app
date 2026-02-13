package com.myinvestments.backend.adapter.`in`.web

import com.myinvestments.backend.application.dto.ImportActivitiesRequestDto
import com.myinvestments.backend.application.dto.ImportActivitiesResponseDto
import com.myinvestments.backend.application.usecase.ImportActivitiesUseCase
import com.myinvestments.backend.domain.error.DomainError
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/import")
class ImportController(private val importActivitiesUseCase: ImportActivitiesUseCase) {

    @PostMapping("/activities")
    fun importActivities(@RequestBody body: ImportActivitiesRequestDto): ResponseEntity<*> {
        if (body.accountId.isBlank()) return ResponseEntity.badRequest().body(mapOf("error" to "accountId is required"))
        return importActivitiesUseCase.importActivities(
            accountId = body.accountId,
            items = body.activities,
            recomputePositions = body.recomputePositions,
        ).fold(
            { err ->
                when (err) {
                    is DomainError.NotFound -> ResponseEntity.status(404).body(mapOf("error" to "Account not found"))
                    is DomainError.InvalidInput -> ResponseEntity.badRequest().body(mapOf("error" to err.message))
                    is DomainError.Persistence -> ResponseEntity.status(500).body(mapOf("error" to err.message))
                }
            },
            { result ->
                ResponseEntity.ok(
                    ImportActivitiesResponseDto(
                        imported = result.imported,
                        positionsUpdated = result.positionsUpdated,
                        positionsCount = result.positionsCount,
                    ),
                )
            },
        )
    }
}
