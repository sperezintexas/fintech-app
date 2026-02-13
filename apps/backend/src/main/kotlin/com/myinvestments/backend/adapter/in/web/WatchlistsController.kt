package com.myinvestments.backend.adapter.`in`.web

import com.myinvestments.backend.application.usecase.WatchlistUseCase
import com.myinvestments.backend.domain.error.DomainError
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class WatchlistDto(val _id: String, val name: String, val purpose: String, val createdAt: String, val updatedAt: String)
data class WatchlistCreateDto(val name: String?, val purpose: String?)

@RestController
@RequestMapping("/watchlists")
class WatchlistsController(private val watchlistUseCase: WatchlistUseCase) {

    @GetMapping
    fun list(): ResponseEntity<*> {
        return when (val result = watchlistUseCase.list()) {
            is arrow.core.Either.Left -> ResponseEntity.status(500).body(mapOf("error" to ((result.value as? DomainError.Persistence)?.message ?: "Failed")))
            is arrow.core.Either.Right -> ResponseEntity.ok(result.value.map { WatchlistDto(it.id, it.name, it.purpose, it.createdAt, it.updatedAt) })
        }
    }

    @PostMapping
    fun create(@RequestBody body: WatchlistCreateDto): ResponseEntity<*> {
        val name = (body.name ?: "").trim()
        if (name.isBlank()) return ResponseEntity.badRequest().body(mapOf("error" to "Name is required"))
        return when (val result = watchlistUseCase.create(name, body.purpose ?: "")) {
            is arrow.core.Either.Left -> ResponseEntity.status(500).body(mapOf("error" to ((result.value as? DomainError.Persistence)?.message ?: "Failed")))
            is arrow.core.Either.Right -> ResponseEntity.status(201).body(WatchlistDto(result.value.id, result.value.name, result.value.purpose, result.value.createdAt, result.value.updatedAt))
        }
    }
}
