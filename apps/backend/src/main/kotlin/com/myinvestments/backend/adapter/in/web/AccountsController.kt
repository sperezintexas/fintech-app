package com.myinvestments.backend.adapter.`in`.web

import com.myinvestments.backend.application.dto.AccountCreateDto
import com.myinvestments.backend.application.dto.AccountUpdateDto
import com.myinvestments.backend.application.dto.toDto
import com.myinvestments.backend.application.usecase.AccountUseCases
import com.myinvestments.backend.domain.error.DomainError
import com.myinvestments.backend.domain.model.Account
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import jakarta.validation.Valid

@RestController
@RequestMapping("/accounts")
class AccountsController(private val accountUseCases: AccountUseCases) {

    @GetMapping
    fun list(): ResponseEntity<*> =
        accountUseCases.getAll().fold(
            { err -> toErrorResponse(err) },
            { list -> ResponseEntity.ok(list.map(Account::toDto)) },
        )

    @GetMapping("/{id}")
    fun getById(@PathVariable id: String): ResponseEntity<*> =
        accountUseCases.getById(id).fold(
            { err -> toErrorResponse(err) },
            { account ->
                if (account == null) ResponseEntity.notFound().build<Any>()
                else ResponseEntity.ok(account.toDto())
            },
        )

    @PostMapping
    fun create(@Valid @RequestBody dto: AccountCreateDto): ResponseEntity<*> =
        accountUseCases.create(dto).fold(
            { err -> toErrorResponse(err) },
            { account -> ResponseEntity.status(201).body(account.toDto()) },
        )

    @PutMapping("/{id}")
    fun update(@PathVariable id: String, @RequestBody dto: AccountUpdateDto): ResponseEntity<*> =
        accountUseCases.update(id, dto).fold(
            { err -> toErrorResponse(err) },
            { account ->
                if (account == null) ResponseEntity.notFound().build<Any>()
                else ResponseEntity.ok(account.toDto())
            },
        )

    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: String): ResponseEntity<*> =
        accountUseCases.delete(id).fold(
            { err -> toErrorResponse(err) },
            { deleted ->
                if (!deleted) ResponseEntity.notFound().build<Any>()
                else ResponseEntity.ok(mapOf("success" to true))
            },
        )

    private fun toErrorResponse(err: DomainError): ResponseEntity<*> =
        when (err) {
            is DomainError.NotFound -> ResponseEntity.notFound().build<Any>()
            is DomainError.InvalidInput -> ResponseEntity.badRequest().body(mapOf("error" to err.message))
            is DomainError.Persistence -> ResponseEntity.status(500).body(mapOf("error" to err.message))
        }
}
