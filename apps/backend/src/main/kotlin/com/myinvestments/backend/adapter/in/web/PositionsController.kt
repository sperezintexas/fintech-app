package com.myinvestments.backend.adapter.`in`.web

import com.myinvestments.backend.application.dto.PositionCloseDto
import com.myinvestments.backend.application.dto.PositionCreateDto
import com.myinvestments.backend.application.dto.PositionDto
import com.myinvestments.backend.application.dto.toDto
import com.myinvestments.backend.application.usecase.PositionUseCase
import com.myinvestments.backend.domain.error.DomainError
import com.myinvestments.backend.domain.model.Position
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/positions")
class PositionsController(private val positionUseCase: PositionUseCase) {

    @GetMapping
    fun list(@RequestParam accountId: String): ResponseEntity<*> =
        positionUseCase.getPositions(accountId).fold(
            { err -> toError(err) },
            { (positions, hasActivities) ->
                ResponseEntity.ok(mapOf("positions" to positions.map { it.toDto() }, "hasActivities" to hasActivities))
            },
        )

    @PostMapping
    fun create(@RequestBody dto: PositionCreateDto): ResponseEntity<*> {
        if (dto.accountId.isBlank()) return ResponseEntity.badRequest().body(mapOf("error" to "accountId is required"))
        val position = Position(
            id = null,
            type = dto.type ?: "stock",
            ticker = dto.ticker,
            shares = dto.shares,
            purchasePrice = dto.purchasePrice,
            currentPrice = dto.currentPrice,
            strike = dto.strike,
            expiration = dto.expiration,
            optionType = dto.optionType,
            contracts = dto.contracts,
            premium = dto.premium,
            amount = dto.amount,
            currency = dto.currency,
        )
        return positionUseCase.createPosition(dto.accountId, position).fold(
            { err -> toError(err) },
            { pos -> ResponseEntity.status(201).body(pos.toDto()) },
        )
    }

    @GetMapping("/{id}")
    fun get(@PathVariable id: String, @RequestParam accountId: String): ResponseEntity<*> =
        positionUseCase.getPosition(accountId, id).fold(
            { err -> toError(err) },
            { pos ->
                if (pos == null) ResponseEntity.notFound().build<Any>()
                else ResponseEntity.ok(pos.toDto())
            },
        )

    @PutMapping("/{id}")
    fun update(
        @PathVariable id: String,
        @RequestBody dto: PositionCreateDto,
    ): ResponseEntity<*> {
        if (dto.accountId.isBlank()) return ResponseEntity.badRequest().body(mapOf("error" to "accountId is required"))
        val position = Position(
            id = id,
            type = dto.type ?: "stock",
            ticker = dto.ticker,
            shares = dto.shares,
            purchasePrice = dto.purchasePrice,
            currentPrice = dto.currentPrice,
            strike = dto.strike,
            expiration = dto.expiration,
            optionType = dto.optionType,
            contracts = dto.contracts,
            premium = dto.premium,
            amount = dto.amount,
            currency = dto.currency,
        )
        return positionUseCase.updatePosition(dto.accountId, id, position).fold(
            { err -> toError(err) },
            { pos ->
                if (pos == null) ResponseEntity.notFound().build<Any>()
                else ResponseEntity.ok(pos.toDto())
            },
        )
    }

    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: String, @RequestParam accountId: String): ResponseEntity<*> =
        positionUseCase.deletePosition(accountId, id).fold(
            { err -> toError(err) },
            { deleted ->
                if (!deleted) ResponseEntity.notFound().build<Any>()
                else ResponseEntity.ok(mapOf("success" to true))
            },
        )

    @PostMapping("/{id}/close")
    fun close(@PathVariable id: String, @RequestBody dto: PositionCloseDto): ResponseEntity<*> {
        if (dto.accountId.isBlank()) return ResponseEntity.badRequest().body(mapOf("error" to "accountId is required"))
        if (dto.quantity < 1) return ResponseEntity.badRequest().body(mapOf("error" to "quantity must be a positive number"))
        if (dto.pricePerContract < 0) return ResponseEntity.badRequest().body(mapOf("error" to "pricePerContract must be >= 0"))
        return positionUseCase.closePosition(dto.accountId, id, dto.quantity, dto.pricePerContract).fold(
            { err -> toError(err) },
            { result -> ResponseEntity.ok(result) },
        )
    }

    private fun toError(err: DomainError): ResponseEntity<*> =
        when (err) {
            is DomainError.NotFound -> ResponseEntity.notFound().build<Any>()
            is DomainError.InvalidInput -> ResponseEntity.badRequest().body(mapOf("error" to err.message))
            is DomainError.Persistence -> ResponseEntity.status(500).body(mapOf("error" to err.message))
        }
}
