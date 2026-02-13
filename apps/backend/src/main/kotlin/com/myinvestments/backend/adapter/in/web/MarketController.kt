package com.myinvestments.backend.adapter.`in`.web

import com.myinvestments.backend.application.usecase.MarketUseCase
import com.myinvestments.backend.domain.error.DomainError
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

@RestController
class MarketController(private val marketUseCase: MarketUseCase) {

    @GetMapping("/market")
    fun getMarket(): ResponseEntity<*> =
        marketUseCase.getMarketConditions().fold(
            { err ->
                when (err) {
                    is DomainError.Persistence -> ResponseEntity.status(503).body(mapOf("error" to err.message))
                    else -> ResponseEntity.status(500).body(mapOf("error" to "Market data failed"))
                }
            },
            { ResponseEntity.ok(it) },
        )
}
